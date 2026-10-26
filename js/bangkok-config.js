import { BKK } from './bangkok-geodata.js';

export const project = (lat, lon) => ({
  x: (lon - 100.534) * 111320 * Math.cos(13.73 * Math.PI / 180),
  z: (13.7285 - lat) * 111320
});
export const ISLAND_BOUNDS = { minX: -6300, maxX: 5400, minZ: -5100, maxZ: 3100, sidewalkHeight: 0.16, waterLevel: -1.5 };
// The inherited material/controller interfaces use these names. Bangkok is mainland;
// neither an island boundary nor the Manhattan park elevation applies here.
export const CENTRAL_PARK_BOUNDS = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
export const NJ_SHORELINE_POLYGON = [];
export const LONG_ISLAND_POLYGONS = [];
export const getIslandBoundsAtZ = null;
export const bryantParkLawn = null;
export const streetZ = () => 0;
export const blockAt = () => null;
export const isTypingInField = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable;

export const LANDMARKS = [
  { id: 'mahanakhon', name: 'King Power Mahanakhon', thai: 'มหานคร', lat: 13.7235, lon: 100.5282, kind: 'mahanakhon', height: 314, size: 48 },
  { id: 'watarun', name: 'Wat Arun', thai: 'วัดอรุณ', lat: 13.7437, lon: 100.4889, kind: 'temple', height: 79, size: 125 },
  { id: 'palace', name: 'The Grand Palace', thai: 'พระบรมมหาราชวัง', lat: 13.7500, lon: 100.4913, kind: 'palace', height: 48, size: 200 },
  { id: 'yaowarat', name: 'Yaowarat', thai: 'เยาวราช', lat: 13.7398, lon: 100.5096, kind: 'chinatown', height: 18, size: 24 },
  { id: 'lumpini', name: 'Lumphini Park', thai: 'สวนลุมพินี', lat: 13.7315, lon: 100.5416, kind: 'park', height: 0, size: 100 },
  { id: 'siam', name: 'Siam Square', thai: 'สยามสแควร์', lat: 13.7457, lon: 100.5338, kind: 'mall', height: 38, size: 100 },
  { id: 'baiyoke', name: 'Baiyoke Tower II', thai: 'ใบหยก', lat: 13.7540, lon: 100.5402, kind: 'baiyoke', height: 304, size: 45 },
  { id: 'iconsiam', name: 'ICONSIAM', thai: 'ไอคอนสยาม', lat: 13.7265, lon: 100.5100, kind: 'iconsiam', height: 72, size: 120 },
  { id: 'asok', name: 'Asok / Sukhumvit', thai: 'อโศก', lat: 13.7371, lon: 100.5602, kind: 'asok', height: 100, size: 40 }
].map(l => ({ ...l, ...project(l.lat, l.lon) }));

export const ROADS = BKK.roads;
export const SEGMENTS = [];
const cells = new Map(), CELL = 100;
for (const road of ROADS) for (let i = 1; i < road.points.length; i++) {
  const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
  const length = Math.hypot(bx - ax, bz - az);
  if (length < 0.1) continue;
  const seg = { road, ax, az, bx, bz, length, ux: (bx - ax) / length, uz: (bz - az) / length };
  SEGMENTS.push(seg);
  for (let x = Math.floor(Math.min(ax, bx) / CELL); x <= Math.floor(Math.max(ax, bx) / CELL); x++) {
    for (let z = Math.floor(Math.min(az, bz) / CELL); z <= Math.floor(Math.max(az, bz) / CELL); z++) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(seg);
    }
  }
}
export function nearestRoad(x, z, radius = 250) {
  let best = null;
  const seen = new Set();
  for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
      for (const s of cells.get(`${ix},${iz}`) || []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const t = Math.max(0, Math.min(s.length, (x - s.ax) * s.ux + (z - s.az) * s.uz));
        const px = s.ax + s.ux * t, pz = s.az + s.uz * t, dist = Math.hypot(px - x, pz - z);
        if (dist <= radius && (!best || dist < best.dist)) best = { ...s, x: px, z: pz, dist };
      }
    }
  }
  return best;
}
export function arrivalAt(x, z) {
  const road = nearestRoad(x, z, 600);
  if (!road) return { x, z, heading: Math.PI };
  const direction = road.road.oneway === -1 ? -1 : 1;
  const offset = Math.min(road.road.width / 4, 3.5) * direction;
  return { x: road.x + road.uz * offset, z: road.z - road.ux * offset, heading: Math.atan2(road.ux * direction, road.uz * direction) };
}
export function getLocationLabel(x, z) {
  const lm = LANDMARKS.find(l => Math.hypot(x - l.x, z - l.z) < 180);
  const road = nearestRoad(x, z);
  return lm ? `${lm.name} · ${lm.thai}` : road?.road.name || 'Bangkok · กรุงเทพมหานคร';
}
export function pointInPolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[i], [bx, bz] = points[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
