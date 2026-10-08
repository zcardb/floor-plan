import { bbox, length, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { formatMeters } from './lengthUnits';
import { dimensionSettings } from './dimensionSettings';
import type { Design, Point } from './types';

export interface DimensionSegment {
  start: number;
  end: number;
  fontSize: number;
  lane: number;
}
export interface PerimeterLayout {
  horizontal: DimensionSegment[];
  vertical: DimensionSegment[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  bounds: ReturnType<typeof bbox>;
}
const tolerance = 1;
const laneSpacing = 220;

function segments(values: number[]): DimensionSegment[] {
  const sorted = [...values].sort((a, b) => a - b);
  const points: number[] = [];
  for (const value of sorted) {
    if (!points.length || value - points[points.length - 1] > tolerance) points.push(value);
  }
  // Keep the exact outer extent when the final coordinate was merged.
  if (points.length > 1) points[points.length - 1] = sorted[sorted.length - 1];
  const laneEnds: number[] = [];
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const fontSize = end - start < 400 ? 125 : 180;
    const halfWidth = (formatMeters(end - start).length + 2) * fontSize * 0.32;
    const center = (start + end) / 2;
    let lane = laneEnds.findIndex(previous => previous + 60 <= center - halfWidth);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = center + halfWidth;
    return { start, end, fontSize, lane };
  });
}

export function perimeterDimensions(d: Pick<Design, 'walls' | 'demolished' | 'dimensionSettings'>): PerimeterLayout | null {
  const demolished = new Set(d.demolished);
  const walls = d.walls.filter(w => !demolished.has(w.id) &&
    [...w.a, ...w.b, w.thickness].every(Number.isFinite) && w.thickness > 0 && length(w) > tolerance);
  if (!walls.length) return null;
  const polygons = walls.map(w => wallPoly(w));
  const outer = bbox(walls.flatMap(w => connectedWallPoly(w, walls, d.demolished)));
  const xs = [outer.x, outer.x2];
  const ys = [outer.y, outer.y2];
  walls.forEach((wall, index) => {
    if (Math.abs(wall.a[0] - wall.b[0]) > tolerance && Math.abs(wall.a[1] - wall.b[1]) > tolerance) return;
    polygons[index].forEach(([x, y]) => { xs.push(x); ys.push(y); });
  });
  const horizontal = segments(xs);
  const vertical = segments(ys);
  const settings = dimensionSettings(d);
  const top = outer.y - settings.top, bottom = outer.y2 + settings.bottom;
  const left = outer.x - settings.left, right = outer.x2 + settings.right;
  const horizontalReach = Math.max(0, ...horizontal.map(s => s.lane)) * laneSpacing + 270;
  const verticalReach = Math.max(0, ...vertical.map(s => s.lane)) * laneSpacing + 270;
  return { horizontal, vertical, top, bottom, left, right,
    bounds: { x: left - verticalReach, x2: right + verticalReach,
      y: top - horizontalReach, y2: bottom + horizontalReach } };
}

export function planDrawingBounds(d: Design, dimensions: boolean) {
  const walls = d.walls.filter(w => [...w.a, ...w.b, w.thickness].every(Number.isFinite) && w.thickness > 0 && length(w) > tolerance);
  const points: Point[] = [...walls.flatMap(w => connectedWallPoly(w, walls, d.demolished)), ...d.rooms.flatMap(r => r.rings.flat())];
  const layout = dimensions ? perimeterDimensions(d) : null;
  if (layout) points.push([layout.bounds.x, layout.bounds.y], [layout.bounds.x2, layout.bounds.y2]);
  const valid = points.filter(p => p.every(Number.isFinite));
  return bbox(valid.length ? valid : [[0, 0], [d.width, d.depth]]);
}

export const dimensionLabelOffset = (segment: DimensionSegment) => 70 + segment.lane * laneSpacing;
