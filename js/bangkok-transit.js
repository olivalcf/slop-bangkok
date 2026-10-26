import * as THREE from 'three/webgpu';
import { BKK } from './bangkok-geodata.js';
import { joinWays, samplePath } from './bangkok-paths.js';

export function buildBangkokTransit({ root, box, cylinder, batch, sign, colliders }) {
  const concrete = new THREE.MeshStandardNodeMaterial({ color: 0x9c9f94, roughness: 0.88 });
  const edge = new THREE.MeshStandardNodeMaterial({ color: 0xbcbcae, roughness: 0.8 });
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x555f5d, roughness: 0.42, metalness: 0.6 });
  const blue = new THREE.MeshStandardNodeMaterial({ color: 0x385e73, roughness: 0.5, metalness: 0.25 });
  const tracks = BKK.transitTracks.filter(t => /BTS|บีทีเอส/.test(t.name));
  const paths = joinWays(tracks);
  const posts = [];
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const ry = Math.atan2(dx, dz), nx = dz / length, nz = -dx / length, x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
      // Each mapped line is one track of the pair, not an eight-metre roadway.
      box(x, 10.7, z, 4.1, 1.35, length + 0.1, concrete, ry);
      box(x, 10.0, z, 2.0, 0.65, length + 0.1, concrete, ry);
      for (const side of [-1, 1]) {
        box(x + nx * 2.0 * side, 11.75, z + nz * 2.0 * side, 0.22, 1.0, length + 0.1, edge, ry);
        box(x + nx * 0.72 * side, 11.43, z + nz * 0.72 * side, 0.09, 0.12, length + 0.1, steel, ry);
      }
    }
    for (let t = 16; t < path.total; t += 30) {
      const p = samplePath(path, t);
      let paired = null;
      for (const other of paths) {
        if (other === path || other.name !== path.name) continue;
        for (let j = 1; j < other.points.length; j++) {
          const a = other.points[j - 1], b = other.points[j], dx = b[0] - a[0], dz = b[1] - a[1];
          const u = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          const x = a[0] + dx * u, z = a[1] + dz * u, distance = Math.hypot(x - p.x, z - p.z);
          if (distance > 1.8 && distance < 7 && (!paired || distance < paired.distance)) paired = { x, z, distance };
        }
      }
      const x = paired ? (p.x + paired.x) / 2 : p.x, z = paired ? (p.z + paired.z) / 2 : p.z;
      if (posts.some(q => Math.hypot(q.x - x, q.z - z) < 22)) continue;
      posts.push({ x, z });
      cylinder(x, 4.6, z, 0.9, 1.1, 9.2, concrete, 10);
      box(x, 9.4, z, paired ? 9.2 : 4.0, 0.6, 2.2, edge, p.heading);
      colliders.push({ minX: x - 1.05, maxX: x + 1.05, minZ: z - 1.05, maxZ: z + 1.05, maxY: 9.5 });
    }
  }
  let stations = 0;
  for (const station of BKK.stations) {
    if (station.ref?.startsWith('G')) continue;
    let nearest = null;
    for (const path of paths) for (let t = 0; t <= path.total; t += 15) {
      const p = samplePath(path, t), dist = Math.hypot(p.x - station.x, p.z - station.z);
      if (!nearest || dist < nearest.dist) nearest = { ...p, dist };
    }
    if (!nearest || nearest.dist > 45) continue;
    stations++;
    const x = station.x, z = station.z, ry = nearest.heading, cs = Math.cos(ry), sn = Math.sin(ry);
    const point = (u, v) => ({ x: x + cs * u + sn * v, z: z - sn * u + cs * v });
    box(x, 8.5, z, 18, 0.8, 138, concrete, ry);
    for (const side of [-1, 1]) {
      const p = point(side * 6.1, 0);
      box(p.x, 11.8, p.z, 4.2, 0.6, 132, edge, ry);
      box(p.x, 12.13, p.z, 4.1, 0.04, 132, new THREE.MeshStandardNodeMaterial({ color: 0xd1be70 }), ry);
      for (let v = -55; v <= 55; v += 22) {
        const q = point(side * 8, v);
        box(q.x, 13.5, q.z, 0.22, 3.1, 0.22, steel, ry);
      }
      // A concourse-level sign is visible from the street in either direction.
      const q = point(side * 9.15, -22);
      sign(`BTS  ${station.thai}  ·  ${station.name}`, q.x, 9, q.z, 11, 1.25, ry + side * Math.PI / 2, '#163d53', '#f0ead2');
      const p2 = point(side * 11, 48);
      box(p2.x, 7.3, p2.z, 6, 0.45, 25, concrete, ry);
      // Stair flights are modeled with treads, rather than solid diagonal wedges.
      for (let step = 0; step < 34; step++) {
        const q = point(side * 12, 37 + step * 0.62);
        box(q.x, step * 0.22, q.z, 2.1, 0.22, 0.72, edge, ry);
      }
    }
    // A curved blue-grey canopy with open ends and exposed structure.
    const profile = [];
    for (let i = 0; i <= 16; i++) { const u = -9 + i * 18 / 16; profile.push(new THREE.Vector2(u, 2.8 * Math.sqrt(Math.max(0, 1 - (u / 9) ** 2)))); }
    for (let i = 16; i >= 0; i--) { const u = -9 + i * 18 / 16; profile.push(new THREE.Vector2(u, 2.8 * Math.sqrt(Math.max(0, 1 - (u / 9) ** 2)) - 0.18)); }
    const roof = new THREE.ExtrudeGeometry(new THREE.Shape(profile), { depth: 136, bevelEnabled: false }).translate(0, 14.7, -68).rotateY(ry).translate(x, 0, z);
    batch(roof, blue);
    for (const v of [-50, 0, 50]) {
      const q = point(0, v); box(q.x, 14.7, q.z, 17.5, 0.15, 0.15, steel, ry);
    }
  }
  const white = new THREE.MeshStandardNodeMaterial({ color: 0xd9dcd6, roughness: 0.4, metalness: 0.2 });
  const red = new THREE.MeshStandardNodeMaterial({ color: 0xb5333b, roughness: 0.45 });
  const navy = new THREE.MeshStandardNodeMaterial({ color: 0x263d58, roughness: 0.25, metalness: 0.4 });
  const window = new THREE.MeshStandardNodeMaterial({ color: 0x1b3743, roughness: 0.15, metalness: 0.6 });
  const trains = [];
  for (const path of paths.filter(p => p.total > 650).sort((a, b) => b.total - a.total).slice(0, 4)) {
    const cars = [];
    for (let car = 0; car < 3; car++) {
      const group = new THREE.Group(); group.name = 'BTS train carriage';
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.85, 2.7, 18.5), white); body.position.y = 1.7; group.add(body);
      for (const side of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.35, 18.2), red); band.position.set(side * 1.44, 0.95, 0); group.add(band);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.4, 18.2), navy); lower.position.set(side * 1.44, 0.54, 0); group.add(lower);
        for (let i = 0; i < 7; i++) {
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 1.7), window); glass.position.set(side * 1.45, 2.1, -7.5 + i * 2.5); group.add(glass);
        }
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.06), window); front.position.set(0, 2.15, 9.28); group.add(front);
      const frontBand = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.28, 0.07), red); frontBand.position.set(0, 1.25, 9.3); group.add(frontBand);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 4.8), edge); roof.position.set(0, 3.15, -1); group.add(roof);
      root.add(group); cars.push(group);
    }
    const station = BKK.stations.find(s => s.name === (path.name.includes('Sukhumvit') ? 'Nana' : 'Sala Daeng'));
    let offset = 100, closest = Infinity;
    if (station) for (let t = 75; t < path.total - 75; t += 10) {
      const p = samplePath(path, t), distance = Math.hypot(p.x - station.x, p.z - station.z);
      if (distance < closest) { closest = distance; offset = t - 145; }
    }
    trains.push({ path, cars, offset });
  }
  console.info(`[bangkok transit] ${tracks.length} mapped BTS track ways, ${stations} stations, ${trains.length} trains`);
  return { tracks, stations, update(elapsed) {
    for (let i = 0; i < trains.length; i++) {
      const { path, cars, offset } = trains[i], margin = 75, range = path.total - margin * 2;
      const phase = (elapsed * 11 + offset) % (range * 2), direction = phase < range ? 1 : -1;
      const lead = margin + (phase < range ? phase : range * 2 - phase);
      for (let j = 0; j < cars.length; j++) {
        const p = samplePath(path, lead - j * 19.3 * direction);
        cars[j].position.set(p.x, 11.45, p.z); cars[j].rotation.y = p.heading + (direction < 0 ? Math.PI : 0);
      }
    }
  } };
}
