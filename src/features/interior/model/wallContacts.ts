import { length, nearestOnWall } from './geometry';
import type { Design, Point, Wall } from './types';

const epsilon = 0.01;
/** Contacts closer than this are the same junction and merge into one cut. */
const mergeGap = 50;
/** Parallel walls share an axis instead of touching it; such ends are split points already. */
const parallelTolerance = 0.05;

export interface WallContact {
  /** Distance from the stored a→b start, in millimeters. */
  offset: number;
  /** Walls that produce this junction, in design order. */
  wallIds: string[];
  kind: 'tee' | 'cross';
  /** True when the junction sits inside one of this wall's door/window openings. */
  blocked: boolean;
}

/**
 * Other walls meeting one wall, listed as cut positions measured from its a end.
 * A wall whose end stops within this wall's thickness is a T junction (cut at its centerline);
 * a wall running through to both sides is a crossing (cut where the centerlines meet).
 */
export function wallContacts(design: Design, wallId: string): WallContact[] {
  const wall = design.walls.find(w => w.id === wallId);
  if (!wall) return [];
  const L = length(wall);
  if (L < epsilon) return [];
  const u: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
  /** Signed distance from this wall's centerline. */
  const side = (p: Point) => (p[1] - wall.a[1]) * u[0] - (p[0] - wall.a[0]) * u[1];
  const half = wall.thickness / 2 + epsilon;
  const found: { offset: number; wallId: string; kind: WallContact['kind'] }[] = [];
  const add = (offset: number, other: Wall, kind: WallContact['kind']) => {
    // When the other wall's body already reaches this wall's end, the two meet at an L corner;
    // a cut there would only peel off a stub as thick as the other wall.
    const reach = other.thickness / 2 + epsilon;
    if (offset < reach || offset > L - reach) return;
    found.push({ offset, wallId: other.id, kind });
  };
  for (const other of design.walls) {
    if (other.id === wall.id || design.demolished.includes(other.id)) continue;
    const otherLength = length(other);
    if (otherLength < epsilon) continue;
    const v: Point = [(other.b[0] - other.a[0]) / otherLength, (other.b[1] - other.a[1]) / otherLength];
    const sine = u[0] * v[1] - u[1] * v[0];
    // Same-axis or parallel walls are pieces of this band, not junctions.
    if (Math.abs(sine) < parallelTolerance) continue;
    const sa = side(other.a), sb = side(other.b);
    if (sa * sb < 0 && Math.abs(sa) > half && Math.abs(sb) > half) {
      // Both ends clear this wall on opposite sides: the centerlines cross.
      const meet: Point = [other.a[0] + (other.b[0] - other.a[0]) * sa / (sa - sb), other.a[1] + (other.b[1] - other.a[1]) * sa / (sa - sb)];
      const offset = (meet[0] - wall.a[0]) * u[0] + (meet[1] - wall.a[1]) * u[1];
      add(offset, other, 'cross');
      continue;
    }
    for (const [end, distance] of [[other.a, sa], [other.b, sb]] as const) {
      if (Math.abs(distance) > half) continue;
      add(nearestOnWall(end, wall).offset, other, 'tee');
    }
  }
  const contacts: WallContact[] = [];
  for (const hit of found.sort((a, b) => a.offset - b.offset)) {
    // A cut within 0.05 m of either end would only create a sliver segment (and drops L corners).
    if (hit.offset < mergeGap || hit.offset > L - mergeGap) continue;
    const previous = contacts[contacts.length - 1];
    if (previous && hit.offset - previous.offset <= mergeGap) {
      if (!previous.wallIds.includes(hit.wallId)) previous.wallIds.push(hit.wallId);
      if (hit.kind === 'cross') previous.kind = 'cross';
      continue;
    }
    contacts.push({ offset: hit.offset, wallIds: [hit.wallId], kind: hit.kind, blocked: false });
  }
  const openings = design.openings.filter(o => o.wallId === wallId);
  return contacts.map(contact => {
    // Whole centimeters match the two-decimal meter inputs, so a chip and a typed value agree.
    const offset = Math.round(contact.offset / 10) * 10;
    return { ...contact, offset, blocked: openings.some(o => offset > o.offset - o.width / 2 && offset < o.offset + o.width / 2) };
  });
}
