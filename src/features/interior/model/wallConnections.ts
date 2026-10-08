import polygonClipping from 'polygon-clipping';
import { length, nearestOnWall, wallPoly } from './geometry';
import type { Point, Wall } from './types';

const epsilon = 0.01;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
interface Ray { direction: Point; thickness: number }

// The coordinates describe faces only. Centerlines, IDs and opening offsets stay intact.
function joinedWallPoly(wall: Wall, walls: Wall[], demolished: string[] = []): Point[] {
  const polygon = wallPoly(wall);
  const L = length(wall);
  if (L < epsilon || demolished.includes(wall.id)) return polygon;
  const direction: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
  for (const end of ['a', 'b'] as const) {
    const origin = wall[end];
    const away: Point = end === 'a' ? direction : [-direction[0], -direction[1]];
    const rays: Ray[] = [];
    for (const other of walls) {
      if (other.id === wall.id || demolished.includes(other.id) || length(other) < epsilon) continue;
      if (distance(nearestOnWall(origin, other).point, origin) > epsilon) continue;
      for (const point of [other.a, other.b]) {
        const dist = distance(origin, point);
        if (dist > epsilon) rays.push({ direction: [(point[0] - origin[0]) / dist, (point[1] - origin[1]) / dist], thickness: other.thickness });
      }
    }
    for (const side of [1, -1]) {
      const normal: Point = [-away[1] * side, away[0] * side];
      const base: Point = [origin[0] + normal[0] * wall.thickness / 2, origin[1] + normal[1] * wall.thickness / 2];
      const candidates = rays.map(ray => {
        const angle = Math.atan2(cross(away, ray.direction) * side, away[0] * ray.direction[0] + away[1] * ray.direction[1]);
        return { ...ray, angle: angle <= 0 ? angle + Math.PI * 2 : angle };
      }).sort((a, b) => a.angle - b.angle);
      const neighbor = candidates[0];
      if (!neighbor) continue;
      const denominator = cross(away, neighbor.direction);
      if (Math.abs(denominator) < 0.05) continue;
      const n: Point = [neighbor.direction[1] * side, -neighbor.direction[0] * side];
      const offset: Point = [n[0] * neighbor.thickness / 2 - normal[0] * wall.thickness / 2, n[1] * neighbor.thickness / 2 - normal[1] * wall.thickness / 2];
      const along = cross(offset, neighbor.direction) / denominator;
      // Bound acute miters and short segments rather than generating distant spikes.
      if (Math.abs(along) > Math.min(L / 2, Math.max(wall.thickness, neighbor.thickness) * 2)) continue;
      const index = end === 'a' ? (side === 1 ? 0 : 3) : (side === 1 ? 2 : 1);
      polygon[index] = [base[0] + away[0] * along, base[1] + away[1] * along];
    }
  }
  return polygon;
}

/** Build the whole continuous equal-thickness band, then slice its joined footprint.
 * This preserves a corner miter even when the end piece is shorter than half the wall thickness. */
export function connectedWallPoly(wall: Wall, walls: Wall[], demolished: string[] = []): Point[] {
  const L = length(wall);
  if (L < epsilon || demolished.includes(wall.id)) return wallPoly(wall);
  const direction: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
  const project = (p: Point) => (p[0] - wall.a[0]) * direction[0] + (p[1] - wall.a[1]) * direction[1];
  const candidates = walls.filter(w => !demolished.includes(w.id) && Math.abs(w.thickness - wall.thickness) < epsilon &&
    [w.a, w.b].every(p => Math.abs(cross(direction, [p[0] - wall.a[0], p[1] - wall.a[1]])) < epsilon))
    .map(w => ({ wall: w, start: Math.min(project(w.a), project(w.b)), end: Math.max(project(w.a), project(w.b)) }))
    .sort((a, b) => a.start - b.start);
  const groups: { start: number; end: number; ids: string[] }[] = [];
  for (const c of candidates) {
    const last = groups[groups.length - 1];
    if (last && c.start <= last.end + epsilon) { last.end = Math.max(last.end, c.end); last.ids.push(c.wall.id); }
    else groups.push({ start: c.start, end: c.end, ids: [c.wall.id] });
  }
  const group = groups.find(g => g.ids.includes(wall.id));
  if (!group || group.ids.length === 1) return joinedWallPoly(wall, walls, demolished);
  const at = (t: number): Point => [wall.a[0] + direction[0] * t, wall.a[1] + direction[1] * t];
  const band: Wall = { ...wall, a: at(group.start), b: at(group.end) };
  const ids = new Set(group.ids);
  const polygon = joinedWallPoly(band, [band, ...walls.filter(w => !ids.has(w.id))], demolished);
  const plain = wallPoly(band);
  if (polygon.every((p, i) => distance(p, plain[i]) < epsilon)) return wallPoly(wall);
  const section = wallSectionPolygons(band, polygon, -group.start, L - group.start)[0] || [];
  // Keep the clockwise winding used by wallPoly and the existing 3D mesh path.
  return section.reverse();
}

// Clip a joined footprint to a wall's existing opening interval (millimeters).
// Only the first/last intervals include the joined end caps.
export function wallSectionPolygons(wall: Wall, polygon: Point[], start: number, end: number): Point[][] {
  const L = length(wall);
  if (L < epsilon || end - start < epsilon) return [];
  const dx = (wall.b[0] - wall.a[0]) / L, dy = (wall.b[1] - wall.a[1]) / L;
  const extent = L + wall.thickness * 8;
  const lo = start <= epsilon ? -extent : start;
  const hi = end >= L - epsilon ? L + extent : end;
  const band: Point[] = [[lo, -extent], [hi, -extent], [hi, extent], [lo, extent]].map(([x, y]) => [wall.a[0] + dx * x - dy * y, wall.a[1] + dy * x + dx * y]);
  return polygonClipping.intersection([polygon], [band]).map(poly => poly[0].slice(0, -1) as Point[]);
}
