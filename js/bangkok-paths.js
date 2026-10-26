// Join OSM ways at shared endpoints; keep separate carriageways separate.
export function joinWays(ways, tolerance = 1, respectOneWay = false) {
  const remaining = ways.map(w => ({ ...w, points: w.points.map(p => [...p]) }));
  const paths = [];
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
  while (remaining.length) {
    const path = remaining.pop();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const way = remaining[i];
        if (way.name !== path.name) continue;
        if (respectOneWay && way.oneway !== path.oneway) continue;
        const a = path.points[0], b = path.points.at(-1), c = way.points[0], d = way.points.at(-1);
        if (close(b, c)) path.points.push(...way.points.slice(1));
        else if ((!respectOneWay || !path.oneway) && close(b, d)) path.points.push(...way.points.slice(0, -1).reverse());
        else if (close(a, d)) path.points.unshift(...way.points.slice(0, -1));
        else if ((!respectOneWay || !path.oneway) && close(a, c)) path.points.unshift(...way.points.slice(1).reverse());
        else continue;
        remaining.splice(i, 1); changed = true;
      }
    }
    path.lengths = [];
    path.total = path.points.slice(1).reduce((sum, p, i) => {
      const a = path.points[i], length = Math.hypot(p[0] - a[0], p[1] - a[1]); path.lengths.push(length); return sum + length;
    }, 0);
    paths.push(path);
  }
  return paths;
}

export function nearestPathPoint(path, x, z) {
  let best = null, travelled = 0;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], length = path.lengths[i - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length || 1)));
    const px = a[0] + dx * t, pz = a[1] + dz * t, distance = Math.hypot(px - x, pz - z);
    if (!best || distance < best.distance) best = { x: px, z: pz, distance, along: travelled + t * length };
    travelled += length;
  }
  return best;
}

export function samplePath(path, distance) {
  let t = Math.max(0, Math.min(path.total, distance)), i = 0;
  while (i < path.lengths.length - 1 && t > path.lengths[i]) t -= path.lengths[i++];
  const a = path.points[i], b = path.points[i + 1], length = path.lengths[i] || 1;
  const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
  return { x: a[0] + ux * t, z: a[1] + uz * t, ux, uz, heading: Math.atan2(ux, uz) };
}
