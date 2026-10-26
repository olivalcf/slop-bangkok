import * as THREE from 'three/webgpu';
import { BKK } from './bangkok-geodata.js';
import { createShopSignAtlas } from './bangkok-materials.js';
import { joinWays, samplePath } from './bangkok-paths.js';

const material = color => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.8 });
export function createStreetscape({ box, cylinder, batch, nightMaterials }) {
  const iron = material(0x47534c), ac = material(0xc9c8b7), dark = material(0x303b38);
  const red = material(0xa34c3e), cream = material(0xccc7ae), blue = material(0x527778), clay = material(0x9f6d49), leaf = material(0x396850);
  const wire = material(0x282d2a), pole = material(0x9a9d8e);
  const signs = createShopSignAtlas(); nightMaterials.push(signs.material);
  const signGeo = new THREE.PlaneGeometry(1, 1);
  let detailCount = 0;
  const zoneCounts = [0, 0, 0];
  function panel(index, x, y, z, width, height, rotation) {
    const geo = signGeo.clone().scale(width, height, 1).rotateY(rotation).translate(x, y, z);
    const uv = geo.getAttribute('uv'), col = index % 4, row = Math.floor(index / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + 0.015 + uv.getX(i) * 0.97) / 4, (3 - row + 0.015 + uv.getY(i) * 0.97) / 4);
    batch(geo, signs.material);
  }
  function detailBuilding(b, road, seed) {
    const zone = b.x > 1700 && b.x < 2900 && b.z > -1850 && b.z < -900 ? 0
      : b.x > -3050 && b.x < -2200 && b.z > -1800 && b.z < -850 ? 1
      : b.x > -1200 && b.x < 200 && b.z > -200 && b.z < 950 ? 2 : -1;
    if (zone < 0 || zoneCounts[zone] >= (zone === 0 ? 380 : 220) || b.h > 26 || !road || road.dist > 24 || b.w < 4 || b.d < 4) return;
    zoneCounts[zone]++;
    detailCount++;
    const ry = b.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry);
    const dx = road.x - b.x, dz = road.z - b.z;
    const normals = [[sn, cs, b.d / 2, b.w], [-sn, -cs, b.d / 2, b.w], [cs, -sn, b.w / 2, b.d], [-cs, sn, b.w / 2, b.d]];
    normals.sort((a, q) => q[0] * dx + q[1] * dz - a[0] * dx - a[1] * dz);
    const [nx, nz, extent, width] = normals[0], angle = Math.atan2(nx, nz), tx = Math.cos(angle), tz = -Math.sin(angle);
    const fx = b.x + nx * (extent + 0.04), fz = b.z + nz * (extent + 0.04);
    const p = (u, y, offset = 0) => ({ x: fx + tx * u + nx * offset, y, z: fz + tz * u + nz * offset });
    const localBox = (u, y, offset, w, h, d, mat) => { const q = p(u, y, offset); box(q.x, q.y, q.z, w, h, d, mat, angle); };
    const bays = Math.min(5, Math.max(1, Math.floor(width / 4.2))), bay = width / bays;
    for (let i = 0; i < bays; i++) {
      const u = -width / 2 + (i + 0.5) * bay, style = (seed + i * 7) % 16;
      const s = p(u, 3.25, 0.15); panel(style, s.x, s.y, s.z, bay * 0.93, 0.95, angle);
      // Sloping fabric awnings and slim shopfront columns.
      for (let stripe = 0; stripe < 6; stripe++) {
        const q = p(u - bay * 0.5 + (stripe + 0.5) * bay / 6, 2.8, 0.85);
        const g = new THREE.BoxGeometry(bay / 6, 0.07, 1.8).rotateX(0.18).rotateY(angle).translate(q.x, q.y, q.z);
        batch(g, stripe % 2 ? cream : (style % 3 ? red : blue));
      }
      localBox(u - bay * 0.48, 1.4, 0.2, 0.15, 2.8, 0.15, cream);
      localBox(u + bay * 0.48, 1.4, 0.2, 0.15, 2.8, 0.15, cream);
      for (let y = 6.7; y < Math.min(14, b.h - 1); y += 3.3) {
        localBox(u, y - 0.9, 0.62, bay * 0.94, 0.16, 1.25, cream);
        localBox(u, y - 0.04, 1.2, bay * 0.94, 0.06, 0.06, iron);
        localBox(u, y - 0.52, 1.2, bay * 0.94, 0.04, 0.04, iron);
        for (let j = 0; j < 7; j++) localBox(u - bay * 0.42 + j * bay * 0.14, y - 0.46, 1.2, 0.035, 0.8, 0.035, iron);
        localBox(u + bay * 0.32, y + 0.85, 0.27, 0.72, 0.5, 0.5, ac);
        localBox(u + bay * 0.32, y + 0.85, 0.53, 0.6, 0.34, 0.02, dark);
        if ((i + seed) % 3 === 0) {
          const q = p(u - bay * 0.3, y - 0.6, 0.8);
          cylinder(q.x, q.y, q.z, 0.2, 0.14, 0.35, clay);
          batch(new THREE.IcosahedronGeometry(0.36, 0).scale(1, 1.5, 1).translate(q.x, q.y + 0.32, q.z), leaf);
        }
      }
      if ((i + seed) % 4 === 0) {
        const q = p(u, b.h + 0.8, -1.5);
        cylinder(q.x, q.y, q.z, 0.62, 0.62, 1.6, ac, 12);
        for (const dy of [-0.6, 0, 0.6]) cylinder(q.x, q.y + dy, q.z, 0.65, 0.65, 0.045, iron, 12);
      }
      // A few perpendicular, framed signboards, rather than text stretched in the road.
      if (i % 3 === 0) {
        const q = p(u - bay * 0.42, Math.min(9, b.h - 1.2), 1.2);
        box(q.x, q.y, q.z, 0.22, 1.2, 2.7, dark, angle);
        panel(style, q.x + tx * 0.14, q.y, q.z + tz * 0.14, 2.6, 1.1, angle + Math.PI / 2);
      }
    }
    localBox(0, b.h + 0.35, -0.2, width + 0.2, 0.7, 0.4, cream);
  }
  function cable(a, b, height, offset, thickness) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), nx = dz / length, nz = -dx / length;
    const start = new THREE.Vector3(a.x + nx * offset, height, a.z + nz * offset);
    const end = new THREE.Vector3(b.x + nx * offset, height, b.z + nz * offset);
    const control = start.clone().lerp(end, 0.5); control.y -= Math.min(1.1, length * 0.025);
    batch(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, control, end), 8, thickness, 3, false), wire);
  }
  function buildRoadDetails() {
    const names = new Set(['Sukhumvit Road', 'Yaowarat Road', 'Charoen Krung Road', 'Silom Road', 'Si Lom Road', 'Soi Sukhumvit 11', 'Soi Sukhumvit 8', 'Soi Sukhumvit 4']);
    const paths = joinWays(BKK.roads.filter(r => names.has(r.name)));
    let spanCount = 0;
    for (const path of paths) {
      if (path.total < 38) continue;
      for (const side of [-1, 1]) {
        let prev = null;
        for (let t = 8; t < path.total; t += 38) {
          const p = samplePath(path, t), offset = (path.width / 2 + 1.2) * side;
          const x = p.x + p.uz * offset, z = p.z - p.ux * offset;
          if (x < -3800 || x > 5000 || z < -2200 || z > 1300) continue;
          box(x, 4.5, z, 0.28, 9, 0.28, pole);
          box(x, 8.1, z, 1.5, 0.12, 0.12, iron, p.heading);
          for (const u of [-0.5, 0, 0.5]) cylinder(x + p.uz * u, 8.35, z - p.ux * u, 0.09, 0.09, 0.3, cream, 5);
          if (prev) {
            for (let i = 0; i < 8; i++) cable(prev, { x, z }, 6.6 + i * 0.14, (i % 3) * 0.09, i < 2 ? 0.045 : 0.018);
            for (let i = 0; i < 3; i++) cable(prev, { x, z }, 8.6, -0.5 + i * 0.5, 0.018);
            spanCount++;
          }
          prev = { x, z };
          // Red-and-white kerb blocks sit on the outside of the carriageway.
          for (let u = 0; u < 30 && t + u < path.total; u += 2.5) {
            const q = samplePath(path, t + u), k = path.width / 2 * side;
            box(q.x + q.uz * k, 0.19, q.z - q.ux * k, 0.24, 0.24, 2.5, Math.floor(u / 2.5) % 2 ? cream : red, q.heading);
          }
          if (Math.round(t) % 3 === 0) {
            const q = { x: x + p.uz * side, z: z - p.ux * side };
            // Stainless food carts, pots, stools, and a fabric umbrella.
            box(q.x, 0.95, q.z, 1.7, 0.85, 0.8, ac, p.heading);
            box(q.x, 1.4, q.z, 1.85, 0.08, 0.95, cream, p.heading);
            cylinder(q.x, 1.57, q.z, 0.26, 0.26, 0.28, ac, 10);
            cylinder(q.x + 0.5, 1.57, q.z, 0.18, 0.18, 0.25, ac, 10);
            cylinder(q.x, 1.7, q.z, 0.03, 0.03, 2.9, iron, 5);
            cylinder(q.x, 3.05, q.z, 0.05, 1.8, 0.6, t % 2 ? red : blue, 10);
            cylinder(q.x + p.ux * 1.6, 0.25, q.z + p.uz * 1.6, 0.23, 0.27, 0.5, red, 8);
          }
        }
      }
    }
    return { detailCount, cableSpans: spanCount };
  }
  return { detailBuilding, buildRoadDetails, panel };
}
