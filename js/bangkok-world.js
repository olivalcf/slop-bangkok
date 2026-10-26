import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BKK } from './bangkok-geodata.js';
import { LANDMARKS, SEGMENTS, nearestRoad, pointInPolygon } from './bangkok-config.js';
import { createCurtainWallMaterial, createFacadeBoxes, cityUniforms } from './tsl-materials.js';
import { createShophouseMaterial, createBangkokRoadMaterial } from './bangkok-materials.js';
import { createStreetscape } from './bangkok-streetscape.js';
import { buildBangkokTransit } from './bangkok-transit.js';
import { createBangkokTrafficVehicle } from './bangkok-vehicles.js';
import { joinWays, nearestPathPoint } from './bangkok-paths.js';
import { buildBangkokCrowd } from './bangkok-crowd.js';

const seeded = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mat = (color, roughness = 0.75, metalness = 0) => new THREE.MeshStandardNodeMaterial({ color, roughness, metalness });

export function buildBangkok(scene) {
  const root = new THREE.Group();
  root.name = 'Bangkok';
  scene.add(root);
  const colliders = [], batches = new Map(), moving = [], nightMaterials = [];
  const staticChunks = [];
  const concrete = mat(0xada99c), curb = mat(0x969c91), gold = mat(0xcda346, 0.3, 0.65);
  const ivory = mat(0xe9dfc4), roof = mat(0x9a3c2f), green = mat(0x3c6751), trunk = mat(0x75624b);
  green.side = THREE.DoubleSide;
  const porcelainCanvas = document.createElement('canvas'); porcelainCanvas.width = porcelainCanvas.height = 256;
  const pc = porcelainCanvas.getContext('2d'); pc.fillStyle = '#e5dfca'; pc.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    pc.strokeStyle = '#c7c3a7'; pc.strokeRect(x, y, 32, 32);
    pc.fillStyle = (x + y) % 64 ? '#78977b' : '#bda360';
    for (let a = 0; a < 6; a++) {
      pc.beginPath(); pc.ellipse(x + 16 + Math.cos(a * Math.PI / 3) * 5, y + 16 + Math.sin(a * Math.PI / 3) * 5, 3, 5, a * Math.PI / 3, 0, Math.PI * 2); pc.fill();
    }
    pc.fillStyle = '#bc8373'; pc.beginPath(); pc.arc(x + 16, y + 16, 2.5, 0, Math.PI * 2); pc.fill();
  }
  const porcelainTexture = new THREE.CanvasTexture(porcelainCanvas); porcelainTexture.colorSpace = THREE.SRGBColorSpace;
  porcelainTexture.wrapS = porcelainTexture.wrapT = THREE.RepeatWrapping; porcelainTexture.repeat.set(6, 12);
  const porcelain = new THREE.MeshStandardNodeMaterial({ map: porcelainTexture, roughness: 0.68, emissive: 0xffd7a0, emissiveIntensity: 0 });
  const asphalt = createBangkokRoadMaterial();
  const waterMat = mat(0x294a37, 0.42, 0);
  const waveCanvas = document.createElement('canvas'); waveCanvas.width = waveCanvas.height = 128;
  const waveContext = waveCanvas.getContext('2d');
  const waveImage = waveContext.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const n = 128 + Math.sin(x * Math.PI / 16 + Math.sin(y * Math.PI / 32)) * 30 + Math.sin(y * Math.PI / 8) * 20;
    waveImage.data.set([n, n, n, 255], i);
  }
  waveContext.putImageData(waveImage, 0, 0);
  const waveTexture = new THREE.CanvasTexture(waveCanvas);
  waveTexture.wrapS = waveTexture.wrapT = THREE.RepeatWrapping;
  waveTexture.repeat.set(0.08, 0.08);
  waterMat.bumpMap = waveTexture; waterMat.bumpScale = 0.45;
  const glass = createCurtainWallMaterial({ glassTint: 0x3c666b, frameTint: 0x708689, boxLocal: true });
  function batch(geo, material) {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geo);
  }
  function box(x, y, z, w, h, d, material, ry = 0) {
    batch(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z), material);
  }
  function cylinder(x, y, z, rt, rb, h, material, sides = 8) {
    batch(new THREE.CylinderGeometry(rt, rb, h, sides).translate(x, y, z), material);
  }
  function line(a, b, width, y, material, height = 0.06) {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    box((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, width, height, length + 0.4, material, Math.atan2(dx, dz));
  }
  function polygon(points, y, material) {
    if (points.length < 3) return;
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    batch(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0), material);
  }
  box(0, -2.1, 0, 28000, 4, 24000, mat(0xa8a48a));

  for (const area of BKK.water) {
    if (area.line) {
      for (let i = 1; i < area.line.length; i++) line(area.line[i - 1], area.line[i], 260, 0.01, waterMat);
    } else polygon(area, 0.01, waterMat);
  }
  for (const p of BKK.parks) polygon(p.points, 0.035, mat(0x627c4f));

  const paint = new THREE.MeshBasicNodeMaterial({ color: 0xe2d7b2 });
  for (const s of SEGMENTS) {
    const y = s.road.bridge ? 0.1 : 0.04;
    line([s.ax, s.az], [s.bx, s.bz], s.road.width + 4, y, curb, 0.16);
    line([s.ax, s.az], [s.bx, s.bz], s.road.width, y + 0.1, asphalt, 0.05);
    if (s.road.major && s.length > 12) {
      for (let t = 3; t < s.length - 3; t += 18) {
        const x = s.ax + s.ux * t, z = s.az + s.uz * t;
        box(x, y + 0.14, z, 0.15, 0.01, Math.min(7, s.length - t), paint, Math.atan2(s.ux, s.uz));
      }
    }
  }

  const low = [], high = [], occupied = new Map();
  const streetscape = createStreetscape({ box, cylinder, batch, nightMaterials });
  const occupancyKey = (x, z) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
  function overlaps(x, z, w, d) {
    for (let ix = Math.floor((x - w) / 100); ix <= Math.floor((x + w) / 100); ix++) {
      for (let iz = Math.floor((z - d) / 100); iz <= Math.floor((z + d) / 100); iz++) {
        for (const b of occupied.get(`${ix},${iz}`) || []) {
          if (Math.abs(x - b.x) < (w + b.w) * 0.52 && Math.abs(z - b.z) < (d + b.d) * 0.52) return true;
        }
      }
    }
    return false;
  }
  function addBuilding(x, z, w, d, h, ry = 0, seed = 0) {
    if (x < -6300 || x > 5400 || z < -5100 || z > 3100) return;
    if (LANDMARKS.some(l => l.kind !== 'park' && Math.hypot(x - l.x, z - l.z) < l.size * 0.8 + Math.max(w, d) * 0.5)) return;
    const road = nearestRoad(x, z, 60);
    if (road && road.dist < road.road.width / 2 + Math.min(w, d) / 2 + 1.5) return;
    const item = { x, y: h / 2, z, w, h, d, ry, tone: seeded(seed) };
    (h > 45 ? high : low).push(item);
    if (h <= 36) streetscape.detailBuilding(item, road, seed);
    const hx = (Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d) / 2;
    const hz = (Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d) / 2;
    colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, maxY: h,
      obb: { cx: x, cz: z, hx: w / 2, hz: d / 2, cs: Math.cos(ry), sn: Math.sin(ry) } });
    const key = occupancyKey(x, z);
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key).push({ x, z, w, d });
    if (h < 26 && seeded(seed + 8) > 0.55) box(x, h + 0.3, z, w + 0.5, 0.6, d + 0.5, concrete, ry);
  }
  for (let i = 0; i < BKK.buildings.length; i++) {
    const b = BKK.buildings[i], pts = b.points;
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    let w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
    if (w < 3 || d < 3 || w > 160 || d > 160) continue;
    let x = (Math.max(...xs) + Math.min(...xs)) / 2, z = (Math.max(...zs) + Math.min(...zs)) / 2;
    let longest = 0, ry = 0;
    for (let j = 1; j < pts.length; j++) {
      const dx = pts[j][0] - pts[j - 1][0], dz = pts[j][1] - pts[j - 1][1], length = dx * dx + dz * dz;
      if (length > longest) { longest = length; ry = Math.atan2(dx, dz); }
    }
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const local = pts.map(p => [(p[0] - x) * cs - (p[1] - z) * sn, (p[0] - x) * sn + (p[1] - z) * cs]);
    const minX = Math.min(...local.map(p => p[0])), maxX = Math.max(...local.map(p => p[0]));
    const minZ = Math.min(...local.map(p => p[1])), maxZ = Math.max(...local.map(p => p[1]));
    x += (minX + maxX) / 2 * cs + (minZ + maxZ) / 2 * sn;
    z += -(minX + maxX) / 2 * sn + (minZ + maxZ) / 2 * cs;
    w = maxX - minX; d = maxZ - minZ;
    const modern = x > -1400 && w * d > 550 && seeded(i) > 0.965;
    const h = b.height || (modern ? 45 + seeded(i + 4) * 110 : 6.6 + Math.floor(seeded(i + 4) * 4) * 3.3);
    addBuilding(x, z, w, d, h, ry, i);
  }
  // OSM footprints are incomplete in places. Fill road frontages with seeded
  // shophouses, leaving mapped parks, waterways, and existing footprints clear.
  const excluded = [ ...BKK.water.filter(Array.isArray), ...BKK.parks.map(p => p.points) ].map(points => ({
    points, minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
    minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1]))
  }));
  let seed = 50;
  for (const s of SEGMENTS) {
    if (s.road.bridge) continue;
    for (let t = 18; t < s.length - 14; t += 28) for (const side of [-1, 1]) {
      seed++;
      const w = 11 + seeded(seed) * 10, d = 13 + seeded(seed + 3) * 15;
      const offset = s.road.width / 2 + 4 + d / 2;
      const x = s.ax + s.ux * t + s.uz * offset * side, z = s.az + s.uz * t - s.ux * offset * side;
      if (x < -6300 || x > 5400 || z < -5100 || z > 3100) continue;
      if (excluded.some(p => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ && pointInPolygon(p.points, x, z))) continue;
      if (overlaps(x, z, w, d)) continue;
      const modern = x > -1300 && seeded(seed + 2) > 0.93;
      addBuilding(x, z, w, d, modern ? 45 + seeded(seed + 7) * 130 : 9 + Math.floor(seeded(seed + 7) * 5) * 3.2, Math.atan2(s.ux, s.uz) + Math.PI / 2, seed);
    }
  }
  const masonry = createShophouseMaterial();
  function facadeChunks(boxes, material, tall) {
    const chunks = new Map();
    for (const b of boxes) {
      const key = `${Math.floor(b.x / 350)},${Math.floor(b.z / 350)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(b);
    }
    for (const list of chunks.values()) {
      const mesh = createFacadeBoxes(material, list);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); root.add(mesh);
      staticChunks.push({ mesh, x: list[0].x, z: list[0].z, tall });
    }
  }
  facadeChunks(low, masonry, false); facadeChunks(high, glass, true);

  function palm(x, z, h = 12) {
    cylinder(x, h / 2, z, 0.17, 0.35, h, trunk, 5);
    for (let j = 0; j < 9; j++) {
      const a = j * Math.PI * 2 / 9, vertices = [], indices = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, r = t * 4.8, width = Math.sin(t * Math.PI) * 0.45;
        for (const side of [-1, 1]) vertices.push(x + Math.cos(a) * r - Math.sin(a) * width * side, h + Math.sin(t * Math.PI) * 1.2 - t * t * 2.6, z + Math.sin(a) * r + Math.cos(a) * width * side);
        if (k < 8) { const i = k * 2; indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(18 * 2), 2)); geo.setIndex(indices); geo.computeVertexNormals();
      batch(geo, green);
    }
  }
  for (const p of BKK.parks) {
    const xs = p.points.map(q => q[0]), zs = p.points.map(q => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    if (maxX - minX > 2000 || maxZ - minZ > 2000) continue;
    for (let x = minX + 14; x < maxX; x += 36) for (let z = minZ + 14; z < maxZ; z += 39) {
      if (pointInPolygon(p.points, x, z) && !BKK.water.some(w => Array.isArray(w) && pointInPolygon(w, x, z))) palm(x, z, 9 + seeded(x + z) * 7);
    }
  }
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    if (!s.road.major || s.length < 35) continue;
    for (let t = 18; t < s.length; t += 70) {
      const offset = s.road.width / 2 + 1.2, x = s.ax + s.ux * t + s.uz * offset, z = s.az + s.uz * t - s.ux * offset;
      cylinder(x, 4, z, 0.09, 0.14, 8, concrete, 5);
      box(x, 8, z, 1.3, 0.14, 0.6, ivory);
      if (i % 4 === 0) palm(x + s.ux * 8, z + s.uz * 8, 10);
    }
  }

  function tower(l) {
    const { x, z, height: h } = l;
    const boxes = [];
    if (l.kind === 'mahanakhon') {
      box(x, 8, z, 76, 16, 68, concrete);
      for (let y = 16; y < h; y += 6) {
        // The open corner spirals around the tower in stacked pixel terraces.
        const a = (y / h) * Math.PI * 3.4, ix = Math.cos(a), iz = Math.sin(a);
        boxes.push({ x: x - ix * 3.5, y: y + 3, z: z - iz * 3.5, w: 44 - Math.abs(ix) * 7, d: 44 - Math.abs(iz) * 7, h: 5.8, tone: 0.5 });
        if (y > 45 && y < 280) box(x + ix * 19, y, z + iz * 19, 9, 0.5, 9, ivory);
      }
      box(x, h + 1, z, 45, 2, 45, concrete);
    } else {
      box(x, 10, z, 74, 20, 66, ivory);
      boxes.push({ x, y: 100, z, w: 48, h: 180, d: 48, tone: 0.5 });
      boxes.push({ x, y: 228, z, w: 33, h: 76, d: 33, tone: 0.5 });
      cylinder(x, 274, z, 14, 20, 16, concrete, 24);
      cylinder(x, 290, z, 2, 2, 32, gold);
    }
    const mesh = createFacadeBoxes(glass, boxes); mesh.castShadow = true; root.add(mesh);
    colliders.push({ minX: x - 38, maxX: x + 38, minZ: z - 34, maxZ: z + 34, maxY: h });
  }
  function prang(x, z, h, width) {
    colliders.push({ minX: x - width * 0.5, maxX: x + width * 0.5, minZ: z - width * 0.5, maxZ: z + width * 0.5, maxY: h });
    for (let i = 0; i < 5; i++) {
      const w = width * (1.25 - i * 0.12), y = h * 0.035 * i;
      box(x, y + h * 0.0175, z, w, h * 0.035, w, ivory);
      box(x, y + h * 0.034, z, w + 0.35, h * 0.009, w + 0.35, gold);
    }
    const profile = [[0.44,0.17],[0.38,0.21],[0.39,0.26],[0.3,0.31],[0.31,0.36],[0.24,0.41],
      [0.24,0.49],[0.2,0.56],[0.18,0.62],[0.15,0.68],[0.13,0.74],[0.1,0.81],[0.065,0.88],[0,1]];
    const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * width, y * h)), 12);
    batch(geo.translate(x, 0, z), porcelain);
    // Porcelain bands, small niches, and the steep stairs break up the tower's silhouette.
    for (let tier = 0; tier < 9; tier++) {
      const y = h * (0.24 + tier * 0.065), radius = width * (0.36 - tier * 0.033);
      cylinder(x, y, z, radius, radius + 0.2, h * 0.012, tier % 3 ? ivory : green, 12);
      for (let side = 0; side < 8; side++) {
        const a = side * Math.PI / 4;
        box(x + Math.cos(a) * radius, y - h * 0.018, z + Math.sin(a) * radius, width * 0.035, h * 0.025, width * 0.035, gold, a);
      }
    }
    for (let i = 0; i < 14; i++) for (const side of [-1, 1]) {
      box(x, i * h * 0.012, z + side * (width * 0.7 - i * width * 0.025), width * 0.15, h * 0.012, width * 0.06, concrete);
    }
    cylinder(x, h + 1, z, 0.03, width * 0.018, h * 0.1, gold, 5);
  }
  function pavilion(x, z, w, d, h) {
    colliders.push({ minX: x - w * 0.43, maxX: x + w * 0.43, minZ: z - d * 0.43, maxZ: z + d * 0.43, maxY: h + 14 });
    box(x, h / 2, z, w * 0.85, h, d * 0.85, ivory);
    for (let tier = 0; tier < 3; tier++) {
      const width = w * (1.12 - tier * 0.15), depth = d * (1.1 - tier * 0.12), baseY = h + tier * 3.4;
      const profile = new THREE.Shape();
      profile.moveTo(-width / 2, 0.8); profile.quadraticCurveTo(-width * 0.32, -0.3, 0, 7);
      profile.quadraticCurveTo(width * 0.32, -0.3, width / 2, 0.8); profile.lineTo(width / 2, 0.45);
      profile.quadraticCurveTo(width * 0.32, -0.65, 0, 6.65); profile.quadraticCurveTo(-width * 0.32, -0.65, -width / 2, 0.45); profile.closePath();
      batch(new THREE.ExtrudeGeometry(profile, { depth, bevelEnabled: false, curveSegments: 8 }).translate(x, baseY, z - depth / 2), roof);
      box(x, baseY + 7, z, 0.45, 0.35, depth, gold);
      for (const end of [-1, 1]) {
        const points = [new THREE.Vector3(-width / 2, 0.8, 0), new THREE.Vector3(-width * 0.24, 1.8, 0), new THREE.Vector3(0, 7, 0), new THREE.Vector3(width * 0.24, 1.8, 0), new THREE.Vector3(width / 2, 0.8, 0)];
        batch(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.13, 5, false).translate(x, baseY, z + end * depth / 2), gold);
        const chofa = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, baseY + 7, z + end * depth / 2), new THREE.Vector3(x, baseY + 10, z + end * (depth / 2 + 1)), new THREE.Vector3(x, baseY + 12, z + end * (depth / 2 + 2)));
        batch(new THREE.TubeGeometry(chofa, 10, 0.14, 5, false), gold);
      }
    }
    for (const side of [-1, 1]) cylinder(x, h + 12, z + side * d * 0.4, 0, 0.8, 8, gold, 5);
  }
  function sign(text, x, y, z, w, h, ry = 0, bg = '#254c41', fg = '#fff1cf') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = fg; ctx.font = '600 45px "Noto Sans Thai", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 83, 490);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardNodeMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    nightMaterials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); mesh.position.set(x, y, z); mesh.rotation.y = ry; root.add(mesh);
  }
  for (const l of LANDMARKS) {
    const { x, z } = l;
    if (['mahanakhon', 'baiyoke'].includes(l.kind)) tower(l);
    else if (l.kind === 'temple') {
      box(x, 0.5, z, 110, 1, 110, ivory);
      prang(x, z, 79, 32);
      for (const dx of [-30, 30]) for (const dz of [-30, 30]) prang(x + dx, z + dz, 28, 11);
      pavilion(x - 75, z + 35, 24, 58, 10);
    } else if (l.kind === 'palace') {
      box(x, 0.5, z, 220, 1, 240, ivory);
      for (let i = -1; i <= 1; i++) pavilion(x + i * 62, z, 44, 82, 15);
      for (let i = -1; i <= 1; i++) prang(x + i * 64, z - 85, 42 + (i === 0 ? 12 : 0), 17);
      for (const dz of [-125, 125]) box(x, 2, z + dz, 230, 4, 2, ivory);
    } else if (['mall', 'iconsiam'].includes(l.kind)) {
      colliders.push({ minX: x - 80, maxX: x + 80, minZ: z - 55, maxZ: z + 55, maxY: 55 });
      box(x, 12, z, 160, 24, 110, ivory);
      const mesh = createFacadeBoxes(glass, [{ x, y: 35, z, w: 145, h: 26, d: 90, tone: 0.5 }]); root.add(mesh);
      for (let i = 0; i < 7; i++) box(x - 70 + i * 22, 51 + i % 3 * 3, z, 25, 4, 100, gold, 0.08 * i);
      sign(l.kind === 'mall' ? 'SIAM' : 'ICONSIAM', x, 32, z + 56, 45, 10);
      if (l.kind === 'iconsiam') {
        for (let i = 0; i < 2; i++) {
          const m = createFacadeBoxes(glass, [{ x: x - 70 + i * 110, y: 120, z: z - 110, w: 38, h: 240 + i * 40, d: 42, tone: 0.5 }]); root.add(m);
        }
      }
    } else if (l.kind === 'chinatown') {
      const s = nearestRoad(x, z, 150);
      if (s) for (let i = -5; i <= 5; i++) {
        const px = s.x + s.ux * i * 28, pz = s.z + s.uz * i * 28, offset = s.road.width / 2 + 3;
        for (const side of [-1, 1]) {
          const sx = px + s.uz * offset * side, sz = pz - s.ux * offset * side;
          sign(['เยาวราช', '金行', 'อาหาร', '龍門'][Math.abs(i) % 4], sx, 12 + Math.abs(i % 3) * 4, sz, 3, 9, Math.atan2(s.uz * side, -s.ux * side), '#a52c25', '#ffdd64');
          cylinder(sx, 4, sz, 0.7, 0.7, 1.2, roof, 12);
        }
      }
    }
  }

  const transit = buildBangkokTransit({ root, box, cylinder, batch, sign, colliders });
  const streetscapeInfo = streetscape.buildRoadDetails();
  console.info('[bangkok streetscape]', streetscapeInfo);
  const crowd = buildBangkokCrowd(root);

  const majorRoads = joinWays(BKK.roads.filter(r => r.major), 1, true).filter(p => p.total > 80);
  const featuredRoads = majorRoads.filter(p => /^(Sukhumvit Road|Yaowarat Road|Silom Road|Si Lom Road|Charoen Krung Road)$/.test(p.name) && p.total > 140);
  const nana = BKK.stations.find(s => s.name === 'Nana');
  const nanaRoads = majorRoads.filter(p => p.name === 'Sukhumvit Road' && p.total > 500 && nearestPathPoint(p, nana.x, nana.z).distance < 35);
  for (let i = 0; i < 300; i++) {
    const local = i < 60 && nanaRoads.length;
    const road = local ? nanaRoads[i % nanaRoads.length] : i < 150 ? featuredRoads[i % featuredRoads.length] : majorRoads[Math.floor(seeded(i + 8) * majorRoads.length)];
    if (!road) break;
    const group = createBangkokTrafficVehicle(i);
    root.add(group);
    const lengths = [], total = road.points.slice(1).reduce((sum, p, j) => {
      const prev = road.points[j]; const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]); lengths.push(len); return sum + len;
    }, 0);
    if (total < 10) continue;
    const center = local ? nearestPathPoint(road, nana.x, nana.z).along : 0;
    const rangeStart = local ? Math.max(0, center - 550) : 0, rangeEnd = local ? Math.min(total, center + 550) : total;
    moving.push({ group, road, lengths, total, rangeStart, rangeEnd, distance: rangeStart + seeded(i + 31) * (rangeEnd - rangeStart), speed: 3 + seeded(i + 42) * 6,
      direction: road.oneway === -1 ? -1 : road.oneway === 1 ? 1 : i % 2 ? -1 : 1 });
  }
  for (const [material, geometries] of batches) {
    const chunks = new Map();
    for (const geometry of geometries) {
      geometry.computeBoundingSphere();
      const center = geometry.boundingSphere.center;
      const key = `${Math.floor(center.x / 350)},${Math.floor(center.z / 350)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(geometry);
    }
    for (const list of chunks.values()) {
      const merged = mergeGeometries(list);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.receiveShadow = material !== waterMat;
      mesh.castShadow = [ivory, porcelain, gold, roof, green, trunk].includes(material);
      root.add(mesh);
      if (merged.boundingSphere === null) merged.computeBoundingSphere();
      const p = merged.boundingSphere;
      staticChunks.push({ mesh, x: p.center.x, z: p.center.z, tall: material === waterMat || p.radius > 1200 });
      for (const geometry of list) geometry.dispose();
    }
  }
  console.info(`[bangkok] ${low.length + high.length} buildings, ${BKK.roads.length} mapped roads, ${moving.length} traffic actors`);
  return {
    root, colliders,
    update(dt, elapsed, active) {
      const distance = active.y > 50 ? 3000 : 1800;
      for (const chunk of staticChunks) chunk.mesh.visible = chunk.tall || Math.hypot(chunk.x - active.x, chunk.z - active.z) < distance;
      waveTexture.offset.set(elapsed * 0.0005, elapsed * 0.0003);
      transit.update(elapsed);
      crowd.update(dt, active);
      for (const car of moving) {
        const span = car.rangeEnd - car.rangeStart;
        car.distance = car.rangeStart + (car.distance - car.rangeStart + car.speed * dt * car.direction + span) % span;
        let t = car.distance, i = 0;
        while (i < car.lengths.length - 1 && t > car.lengths[i]) t -= car.lengths[i++];
        const a = car.road.points[i], b = car.road.points[i + 1], len = car.lengths[i] || 1;
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
        // Thailand drives on the left relative to its direction of travel.
        const lane = Math.min(car.road.width / 4, 3.5) * car.direction;
        const x = a[0] + ux * t + uz * lane, z = a[1] + uz * t - ux * lane;
        car.group.position.set(x, 0.2, z);
        car.group.rotation.y = Math.atan2(ux * car.direction, uz * car.direction);
        car.group.visible = Math.hypot(x - active.x, z - active.z) > 7;
      }
      const glow = cityUniforms.uInteriorGlow.value;
      porcelain.emissiveIntensity = Math.max(0, glow - 0.8) * 0.3;
      for (const material of nightMaterials) material.emissiveIntensity = glow * 0.7;
    }
  };
}
