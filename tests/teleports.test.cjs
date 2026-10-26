const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
let config;
test.before(async () => { config = await import('../js/bangkok-config.js'); });
test('every Bangkok teleport destination resolves to a mapped roadway', () => {
  const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
  const ids = [...html.matchAll(/data-teleport="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), config.LANDMARKS.map(l => l.id).sort());
  for (const l of config.LANDMARKS) {
    const p = config.arrivalAt(l.x + l.size * 0.65, l.z + l.size * 0.65);
    assert.ok([p.x, p.z, p.heading].every(Number.isFinite), l.name);
    const road = config.nearestRoad(p.x, p.z, 25);
    assert.ok(road && road.dist < road.road.width / 2, `${l.name} arrives in a road lane`);
    assert.ok(p.x > config.ISLAND_BOUNDS.minX && p.x < config.ISLAND_BOUNDS.maxX);
    assert.ok(p.z > config.ISLAND_BOUNDS.minZ && p.z < config.ISLAND_BOUNDS.maxZ);
  }
});
test('Bangkok projection keeps Wat Arun west of the palace and Mahanakhon south of Siam', () => {
  const byId = Object.fromEntries(config.LANDMARKS.map(l => [l.id, l]));
  assert.ok(byId.watarun.x < byId.palace.x);
  assert.ok(byId.mahanakhon.z > byId.siam.z);
  assert.deepEqual(config.project(13.7285, 100.534), { x: 0, z: 0 });
});
test('map road lookup respects its radius and reports Bangkok streets', () => {
  assert.equal(config.nearestRoad(900000, 900000, 50), null);
  const p = config.arrivalAt(0, 0);
  assert.match(config.getLocationLabel(p.x, p.z), /Silom|Rama|Si Lom|สีลม|พระราม|Sala|ศาลา|Bangkok/i);
});
