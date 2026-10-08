import { area, bbox, center, length } from './geometry';
import { connectedWallPoly, wallSectionPolygons } from './wallConnections';
import { doorOrientation } from './doorOrientation';
import { dimensionSettings } from './dimensionSettings';
import { dimensionLabelOffset, perimeterDimensions } from './perimeterDimensions';
import { formatMeters } from './lengthUnits';
import type { Design, Layers, Point } from './types';
import { furnitureDrawing } from './furnitureDrawing';
import { isBearingWall, wallKindName } from './wallPolicy';

export type DrawingLayer = 'WALLS' | 'DEMOLISHED' | 'ROOMS' | 'OPENINGS' | 'FURNITURE' | 'ROOM_LABELS' | 'DIMENSIONS' | 'MEASURES';
/** Object grouping for vector exports (SVG/PDF). DXF geometry ignores it. */
export interface DrawingGroup { id: string; name: string }
export type DrawingEntity = (
  | { kind: 'polyline'; points: Point[]; closed: boolean; layer: DrawingLayer }
  | { kind: 'arc'; center: Point; radius: number; start: number; end: number; clockwise: boolean; layer: DrawingLayer }
  | { kind: 'text'; point: Point; height: number; rotation: number; text: string; layer: DrawingLayer }
) & { group?: DrawingGroup };
export const DRAWING_LAYERS: DrawingLayer[] = ['WALLS', 'DEMOLISHED', 'ROOMS', 'OPENINGS', 'FURNITURE', 'ROOM_LABELS', 'DIMENSIONS', 'MEASURES'];
export const DRAWING_LAYER_NAMES: Record<DrawingLayer, string> = {
  WALLS: '墙体', DEMOLISHED: '拆除墙体', ROOMS: '房间', OPENINGS: '门窗', FURNITURE: '家具',
  ROOM_LABELS: '房间名称', DIMENSIONS: '尺寸标注', MEASURES: '测量',
};
const ALL_LAYERS: Layers = { grid: false, dims: true, labels: true, furn: true, bearing: false, snap: false };
/** Exports always contain every layer, independent of canvas visibility toggles. */
export function createExportDocument(d: Design): DrawingDocument {
  return createDrawingDocument({ ...d, dimensionSettings: { ...d.dimensionSettings, visible: true } }, ALL_LAYERS);
}
export interface DrawingDimension {
  first: Point; second: Point; lineFirst: Point; lineSecond: Point;
  label: Point; height: number; rotation: number; text: string; measurement: number;
  layer: DrawingLayer; display: DrawingEntity[];
}
export interface DrawingDocument {
  entities: DrawingEntity[]; dimensions: DrawingDimension[];
  bounds: ReturnType<typeof bbox>;
}
export const drawingLine = (a: Point, b: Point, layer: DrawingLayer): DrawingEntity => ({ kind: 'polyline', points: [a, b], closed: false, layer });

export function drawingDimension(first: Point, second: Point, lineFirst: Point, lineSecond: Point, label: Point,
  height: number, rotation: number, measurement: number, layer: DrawingLayer): DrawingDimension {
  const display: DrawingEntity[] = [drawingLine(lineFirst, lineSecond, layer)];
  const dx = lineSecond[0] - lineFirst[0], dy = lineSecond[1] - lineFirst[1];
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  for (const [point, onLine] of [[first, lineFirst], [second, lineSecond]] as [Point, Point][]) {
    display.push(drawingLine(point, onLine, layer));
    display.push(drawingLine([onLine[0] - 60 * (ux + uy), onLine[1] - 60 * (uy - ux)],
      [onLine[0] + 60 * (ux + uy), onLine[1] + 60 * (uy - ux)], layer));
  }
  if (Math.hypot(label[0] - (lineFirst[0] + lineSecond[0]) / 2, label[1] - (lineFirst[1] + lineSecond[1]) / 2) > 150)
    display.push(drawingLine([(lineFirst[0] + lineSecond[0]) / 2, (lineFirst[1] + lineSecond[1]) / 2], label, layer));
  const text = `${formatMeters(measurement)} m`;
  display.push({ kind: 'text', point: label, height, rotation, text, layer });
  return { first, second, lineFirst, lineSecond, label, height, rotation, measurement, text, layer, display };
}

export function createDrawingDocument(d: Design, layers: Layers): DrawingDocument {
  const valid = d.walls.filter(w => [...w.a, ...w.b, w.thickness].every(Number.isFinite) && length(w) > 0.01 && w.thickness > 0);
  if (!valid.length) throw new Error('没有可导出的有效墙体');
  const entities: DrawingEntity[] = [], dimensions: DrawingDimension[] = [];
  for (const wall of valid) {
    const demolished = d.demolished.includes(wall.id);
    const polygon = connectedWallPoly(wall, valid, d.demolished);
    const openings = demolished ? [] : d.openings.filter(o => o.wallId === wall.id).sort((a, b) => a.offset - b.offset);
    const group = { id: wall.id, name: demolished ? '拆除墙体' : isBearingWall(wall) ? '承重墙' : wallKindName(wall) };
    let pos = 0;
    for (const o of openings) {
      for (const points of wallSectionPolygons(wall, polygon, pos, o.offset - o.width / 2))
        entities.push({ kind: 'polyline', closed: true, points, layer: 'WALLS', group });
      pos = o.offset + o.width / 2;
    }
    for (const points of wallSectionPolygons(wall, polygon, pos, length(wall)))
      entities.push({ kind: 'polyline', closed: true, points, layer: demolished ? 'DEMOLISHED' : 'WALLS', group });
  }
  for (const r of d.rooms) {
    for (const ring of r.rings) entities.push({ kind: 'polyline', closed: true, points: ring, layer: 'ROOMS', group: { id: r.id, name: r.name } });
    if (layers.labels && r.counted !== false) {
      const p = center(r);
      entities.push({ kind: 'text', point: p, height: 220, rotation: 0, text: r.name, layer: 'ROOM_LABELS' },
        { kind: 'text', point: [p[0], p[1] + 250], height: 160, rotation: 0, text: `${area(r).toFixed(2)} m²`, layer: 'ROOM_LABELS' });
    }
  }
  for (const o of d.openings) {
    const wall = valid.find(w => w.id === o.wallId);
    if (!wall || d.demolished.includes(wall.id)) continue;
    const L = length(wall), ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
    const p: Point = [wall.a[0] + ux * o.offset, wall.a[1] + uy * o.offset];
    const local = (x: number, y: number): Point => [p[0] + ux * x - uy * y, p[1] + uy * x + ux * y];
    const group = { id: o.id, name: o.kind === 'window' ? '窗' : '门' };
    if (o.kind === 'window') {
      entities.push({ kind: 'polyline', closed: true, layer: 'OPENINGS', group, points: [local(-o.width / 2, -wall.thickness / 2), local(o.width / 2, -wall.thickness / 2), local(o.width / 2, wall.thickness / 2), local(-o.width / 2, wall.thickness / 2)] },
        { ...drawingLine(local(-o.width / 2, 0), local(o.width / 2, 0), 'OPENINGS'), group });
    } else {
      const { mirrorX, mirrorY } = doorOrientation(o), hinge = local(-o.width / 2 * mirrorX, 0);
      const a = local(-o.width / 2 * mirrorX, -o.width * mirrorY), b = local(o.width / 2 * mirrorX, 0);
      entities.push({ ...drawingLine(hinge, a, 'OPENINGS'), group }, { kind: 'arc', layer: 'OPENINGS', group, center: hinge, radius: o.width,
        start: Math.atan2(a[1] - hinge[1], a[0] - hinge[0]), end: Math.atan2(b[1] - hinge[1], b[0] - hinge[0]), clockwise: mirrorX * mirrorY > 0 });
    }
  }
  if (layers.furn) for (const f of d.furniture) {
    const group = { id: f.id, name: f.name };
    entities.push(...furnitureDrawing(f).map(e => ({ ...e, group })));
  }
  const layout = layers.dims && dimensionSettings(d).visible ? perimeterDimensions(d) : null;
  if (layout) for (const chain of layout.chains) for (const segment of chain.segments) {
    const at = chain.at, source = chain.sourceAt, center = (segment.start + segment.end) / 2;
    const labelAt = at + chain.outward * dimensionLabelOffset(segment);
    dimensions.push(drawingDimension(chain.horizontal ? [segment.start, source] : [source, segment.start],
      chain.horizontal ? [segment.end, source] : [source, segment.end],
      chain.horizontal ? [segment.start, at] : [at, segment.start], chain.horizontal ? [segment.end, at] : [at, segment.end],
      chain.horizontal ? [center, labelAt] : [labelAt, center], segment.fontSize, chain.horizontal ? 0 : -90, segment.end - segment.start, 'DIMENSIONS'));
  }
  for (const m of d.measures) {
    const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
    if (L > 0.01) dimensions.push(drawingDimension(m.a, m.b, m.a, m.b, [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2 - 100], 160,
      Math.atan2(m.b[1] - m.a[1], m.b[0] - m.a[0]) * 180 / Math.PI, L, 'MEASURES'));
  }
  const points: Point[] = [];
  for (const e of [...entities, ...dimensions.flatMap(dim => dim.display)]) {
    if (e.kind === 'polyline') points.push(...e.points);
    else if (e.kind === 'arc') points.push([e.center[0] - e.radius, e.center[1] - e.radius], [e.center[0] + e.radius, e.center[1] + e.radius]);
    else {
      const width = e.text.length * e.height * 0.65, height = e.height * 1.5;
      points.push([e.point[0] - width, e.point[1] - height], [e.point[0] + width, e.point[1] + height]);
    }
  }
  if (layout) points.push([layout.bounds.x, layout.bounds.y], [layout.bounds.x2, layout.bounds.y2]);
  return { entities, dimensions, bounds: bbox(points) };
}
