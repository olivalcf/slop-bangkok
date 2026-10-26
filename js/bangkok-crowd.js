import { BKK } from './bangkok-geodata.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { joinWays, samplePath } from './bangkok-paths.js';

export function buildBangkokCrowd(root) {
  const names = new Set(['Sukhumvit Road', 'Yaowarat Road', 'Si Lom Road', 'Silom Road']);
  const paths = joinWays(BKK.roads.filter(r => names.has(r.name))).filter(p => p.total > 120);
  const people = [], ground = () => 0.2;
  for (const path of paths) {
    const count = Math.min(28, Math.floor(path.total / 26));
    for (let i = 0; i < count; i++) {
      const seed = people.length + 1, side = seed % 2 ? -1 : 1;
      const rig = new PersonRig({ seed, female: seed % 3 === 0, scale: 0.92 + seed % 5 * 0.025, hair: seed % 7 / 8 });
      const distance = 12 + (i / count) * (path.total - 24), p = samplePath(path, distance), offset = (path.width / 2 + 1.1) * side;
      rig.reset(p.x + p.uz * offset, p.z - p.ux * offset, p.heading, ground);
      people.push({ rig, path, distance, side, speed: 0.65 + seed % 5 * 0.13 });
    }
  }
  const crowd = new PersonCrowd(Math.max(1, people.length), { farDistance: 45, castShadow: false });
  root.add(...crowd.meshes);
  return { update(dt, camera) {
    crowd.begin();
    for (const person of people) {
      const range = person.path.total - 24;
      person.distance = (person.distance + dt * person.speed) % (range * 2);
      const backwards = person.distance > range;
      const p = samplePath(person.path, 12 + (backwards ? range * 2 - person.distance : person.distance));
      const offset = (person.path.width / 2 + 1.1) * person.side;
      const x = p.x + p.uz * offset, z = p.z - p.ux * offset, distance = Math.hypot(x - camera.x, z - camera.z);
      if (distance > 220) continue;
      person.rig.update(dt, x, z, p.heading + (backwards ? Math.PI : 0), ground);
      crowd.add(person.rig, distance);
    }
    crowd.end();
  } };
}
