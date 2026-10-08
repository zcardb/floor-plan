import polygonClipping from 'polygon-clipping';
import { bbox, length, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { formatMeters } from './lengthUnits';
import { dimensionSettings } from './dimensionSettings';
import type { Design, Point } from './types';
import { dimensionBinding, type DimensionBinding } from './dimensionBinding';

export interface DimensionSegment {
  start: number; end: number; fontSize: number; lane: number;
  binding?: DimensionBinding;
}
export interface DimensionChain {
  horizontal: boolean; at: number; sourceAt: number; outward: -1 | 1;
  segments: DimensionSegment[]; overall?: boolean;
}
export interface PerimeterLayout {
  horizontal: DimensionSegment[]; vertical: DimensionSegment[];
  top: number; bottom: number; left: number; right: number;
  chains: DimensionChain[];
  bounds: ReturnType<typeof bbox>;
}
const tolerance = 0.01;
const laneSpacing = 240;
export const dimensionLabelOffset = (segment: DimensionSegment) => 90 + segment.lane * laneSpacing;

function segments(values: number[]): DimensionSegment[] {
  const sorted = [...values].sort((a, b) => a - b);
  const points: number[] = [];
  for (const value of sorted) if (!points.length || value - points[points.length - 1] > tolerance) points.push(value);
  const laneEnds: number[] = [];
  return points.slice(1).map((end, index) => {
    const start = points[index], fontSize = end - start < 400 ? 125 : 180;
    const halfWidth = (formatMeters(end - start).length + 2) * fontSize * 0.34;
    const center = (start + end) / 2;
    let lane = laneEnds.findIndex(previous => previous + 80 <= center - halfWidth);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = center + halfWidth;
    return { start, end, fontSize, lane };
  });
}

/** Intersect the merged footprint with a scan line; internal wall joins disappear. */
function scanIntervals(rings: Point[][], horizontal: boolean, scan: number): [number, number][] {
  const intersections: number[] = [];
  const axis = horizontal ? 0 : 1, cross = horizontal ? 1 : 0;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[cross] > scan) === (b[cross] > scan)) continue;
    intersections.push(a[axis] + (scan - a[cross]) * (b[axis] - a[axis]) / (b[cross] - a[cross]));
  }
  intersections.sort((a, b) => a - b);
  const intervals: [number, number][] = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) if (intersections[i + 1] - intersections[i] > tolerance)
    intervals.push([intersections[i], intersections[i + 1]]);
  return intervals;
}

export function perimeterDimensions(d: Pick<Design, 'walls' | 'demolished' | 'dimensionSettings'>): PerimeterLayout | null {
  const demolished = new Set(d.demolished);
  const walls = d.walls.filter(w => !demolished.has(w.id) && [...w.a, ...w.b, w.thickness].every(Number.isFinite) && w.thickness > 0 && length(w) > tolerance);
  if (!walls.length) return null;
  const polygons = walls.map(w => connectedWallPoly(w, walls, d.demolished));
  const footprints = polygons.map(poly => [poly] as polygonClipping.Polygon);
  const merged = polygonClipping.union(footprints[0], ...footprints.slice(1));
  const rings = merged.flatMap(poly => poly.map(ring => ring.slice(0, -1) as Point[]));
  const outer = bbox(polygons.flat()), settings = dimensionSettings(d);
  const top = outer.y - settings.top, bottom = outer.y2 + settings.bottom;
  const left = outer.x - settings.left, right = outer.x2 + settings.right;
  const chains: DimensionChain[] = [];
  for (const side of [{ horizontal: true, outward: -1 as const, edge: outer.y, at: top },
    { horizontal: true, outward: 1 as const, edge: outer.y2, at: bottom },
    { horizontal: false, outward: -1 as const, edge: outer.x, at: left },
    { horizontal: false, outward: 1 as const, edge: outer.x2, at: right }]) {
    const cross = side.horizontal ? 1 : 0;
    const lo = side.horizontal ? outer.x : outer.y, hi = side.horizontal ? outer.x2 : outer.y2;
    // Probe immediately behind each wall parallel to this side. The closest probe
    // that exposes a real gap describes that side's connected structural bands.
    const probes: number[] = [];
    walls.forEach(w => {
      if (Math.abs(w.a[cross] - w.b[cross]) > tolerance) return;
      const face = w.a[cross] - side.outward * w.thickness / 2;
      const scan = face - side.outward * 0.02;
      if (scan > (side.horizontal ? outer.y : outer.x) && scan < (side.horizontal ? outer.y2 : outer.x2)) probes.push(scan);
    });
    probes.sort((a, b) => side.outward * (b - a));
    let sourceAt = side.edge;
    let values = [lo, hi];
    for (const scan of probes) {
      const intervals = scanIntervals(rings, side.horizontal, scan);
      if (intervals.length < 2) continue;
      sourceAt = scan;
      values = [lo, hi, ...intervals.flat()];
      break;
    }
    // With isolated/nonclosed walls, show external contour segments only; no fake
    // half-thickness or unconnected distant endpoint projections.
    if (values.length === 2) {
      const edgeIntervals = scanIntervals(rings, side.horizontal, side.edge - side.outward * 0.02);
      if (edgeIntervals.length > 1) { values = [lo, hi, ...edgeIntervals.flat()]; sourceAt = side.edge; }
    }
    const chain = { ...side, sourceAt, segments: segments(values).map(segment => ({ ...segment,
      binding: dimensionBinding(walls, side.horizontal, segment.start, segment.end, sourceAt),
    })) };
    chains.push(chain);
    const reach = Math.max(0, ...chain.segments.map(s => s.lane)) * laneSpacing + 480;
    chains.push({ horizontal: side.horizontal, outward: side.outward, sourceAt: side.edge,
      at: side.at + side.outward * reach, segments: segments([lo, hi]), overall: true });
  }
  const extent: Point[] = polygons.flat();
  for (const chain of chains) {
    for (const s of chain.segments) {
      const offset = chain.at + chain.outward * (dimensionLabelOffset(s) + 220);
      extent.push(chain.horizontal ? [s.start - 350, offset] : [offset, s.start - 350]);
      extent.push(chain.horizontal ? [s.end + 350, offset] : [offset, s.end + 350]);
    }
  }
  return { horizontal: chains[0].segments, vertical: chains[4].segments, top, bottom, left, right, chains, bounds: bbox(extent) };
}

export function planDrawingBounds(d: Design, dimensions: boolean) {
  const walls = d.walls.filter(w => [...w.a, ...w.b, w.thickness].every(Number.isFinite) && w.thickness > 0 && length(w) > tolerance);
  const points: Point[] = [...walls.flatMap(w => connectedWallPoly(w, walls, d.demolished)), ...d.rooms.flatMap(r => r.rings.flat())];
  const layout = dimensions ? perimeterDimensions(d) : null;
  if (layout) points.push([layout.bounds.x, layout.bounds.y], [layout.bounds.x2, layout.bounds.y2]);
  const valid = points.filter(p => p.every(Number.isFinite));
  return bbox(valid.length ? valid : [[0, 0], [d.width, d.depth]]);
}
