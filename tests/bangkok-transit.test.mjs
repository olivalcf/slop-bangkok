import assert from 'node:assert/strict';
import test from 'node:test';
import { BKK } from '../js/bangkok-geodata.js';
import { joinWays, samplePath } from '../js/bangkok-paths.js';

function distanceToTrack(station, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((station.x - a[0]) * dx + (station.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(station.x - a[0] - t * dx, station.z - a[1] - t * dz));
  }
  return best;
}

test('Nana, Asok, and Siam have mapped BTS tracks beside their station nodes', () => {
  const tracks = BKK.transitTracks.filter(t => /BTS/.test(t.name));
  for (const [name, ref] of [['Nana','E3'],['Asok','E4'],['Siam','CEN']]) {
    const station = BKK.stations.find(s => s.name === name);
    assert.equal(station?.ref, ref);
    assert.ok(Math.min(...tracks.map(t => distanceToTrack(station, t.points))) < 15, `${name} has a nearby mapped viaduct`);
  }
});
test('the Sukhumvit train path connects Nana and Asok without teleporting between OSM ways', () => {
  const paths = joinWays(BKK.transitTracks.filter(t => t.name === 'BTS Sukhumvit Line'));
  const nana = BKK.stations.find(s => s.name === 'Nana'), asok = BKK.stations.find(s => s.name === 'Asok');
  assert.ok(paths.some(p => distanceToTrack(nana,p.points) < 15 && distanceToTrack(asok,p.points) < 15));
});
test('path joining handles reversed way geometry and samples a continuous route', () => {
  const [path] = joinWays([
    {name:'test', points:[[0,0],[0,10]]},
    {name:'test', points:[[10,10],[0,10]]},
    {name:'test', points:[[10,10],[10,20]]}
  ]);
  assert.equal(path.total,30);
  const middle = samplePath(path,15);
  assert.deepEqual({x:middle.x,z:middle.z},{x:5,z:10});
  for (const p of [samplePath(path,-1),samplePath(path,31)]) assert.ok(Number.isFinite(p.heading));
});
