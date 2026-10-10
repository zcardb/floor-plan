import { area, bbox, center, length } from './geometry';
import { connectedWallPoly, wallSectionPolygons } from './wallConnections';
import { doorOrientation } from './doorOrientation';
import { openingKindLabel } from './hardMaterials';
import { dimensionSettings } from './dimensionSettings';
import { dimensionLabelOffset, perimeterDimensions } from './perimeterDimensions';
import { formatMeters } from './lengthUnits';
import type { Design, Layers, Opening, Point } from './types';
import { furnitureDrawing } from './furnitureDrawing';
import { isBearingWall, wallKindName } from './wallPolicy';

export type DrawingLayer = 'WALLS' | 'DEMOLISHED' | 'ROOMS' | 'OPENINGS' | 'FURNITURE' | 'ROOM_LABELS' | 'DIMENSIONS';
/** Object grouping for vector exports (SVG/PDF). DXF geometry ignores it. */
export interface DrawingGroup { id: string; name: string }
export type DrawingEntity = (
  | { kind: 'polyline'; points: Point[]; closed: boolean; layer: DrawingLayer }
  | { kind: 'arc'; center: Point; radius: number; start: number; end: number; clockwise: boolean; layer: DrawingLayer }
  | { kind: 'circle'; center: Point; radius: number; layer: DrawingLayer }
  /** `major` is the semi-major axis vector from the centre; `ratio` = minor / major (≤ 1). */
  | { kind: 'ellipse'; center: Point; major: Point; ratio: number; layer: DrawingLayer }
  | { kind: 'text'; point: Point; height: number; rotation: number; text: string; layer: DrawingLayer }
) & { group?: DrawingGroup };
/** Reusable symbol geometry in local coordinates (DXF BLOCK). */
export interface DrawingBlock { name: string; entities: DrawingEntity[] }
/** One placed symbol (DXF INSERT); `rotation` is in radians, drawing (y-down) coordinates. */
export interface DrawingInsert { block: string; point: Point; rotation: number; layer: DrawingLayer; groupId: string }
export const DRAWING_LAYERS: DrawingLayer[] = ['WALLS', 'DEMOLISHED', 'ROOMS', 'OPENINGS', 'FURNITURE', 'ROOM_LABELS', 'DIMENSIONS'];
export const DRAWING_LAYER_NAMES: Record<DrawingLayer, string> = {
  WALLS: '墙体', DEMOLISHED: '拆除墙体', ROOMS: '房间', OPENINGS: '门窗', FURNITURE: '家具',
  ROOM_LABELS: '房间名称', DIMENSIONS: '尺寸标注',
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
  /** Furniture and openings as reusable blocks; `entities` still carries their world geometry for SVG/PDF. */
  blocks: DrawingBlock[]; inserts: DrawingInsert[];
  bounds: ReturnType<typeof bbox>;
}
export const drawingLine = (a: Point, b: Point, layer: DrawingLayer): DrawingEntity => ({ kind: 'polyline', points: [a, b], closed: false, layer });

/** Rotate (radians, about the local origin) then translate a local-coordinate entity. */
export function transformEntity(e: DrawingEntity, point: Point, rotation: number): DrawingEntity {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const at = ([x, y]: Point): Point => [point[0] + c * x - s * y, point[1] + s * x + c * y];
  if (e.kind === 'polyline') return { ...e, points: e.points.map(at) };
  if (e.kind === 'arc') return { ...e, center: at(e.center), start: e.start + rotation, end: e.end + rotation };
  if (e.kind === 'circle') return { ...e, center: at(e.center) };
  if (e.kind === 'ellipse') return { ...e, center: at(e.center), major: [c * e.major[0] - s * e.major[1], s * e.major[0] + c * e.major[1]] };
  return { ...e, point: at(e.point), rotation: e.rotation + rotation * 180 / Math.PI };
}

/** Opening symbol in local coordinates: wall direction is +x, opening centre at the origin. */
export function openingDrawing(o: Opening, thickness: number): DrawingEntity[] {
  const half = o.width / 2, t = thickness / 2;
  // 垭口：只画洞口两侧贯穿墙厚的边线，没有门扇与开启弧线。
  if (o.kind === 'passage') return [-half, half].map(x => drawingLine([x, -t], [x, t], 'OPENINGS'));
  if (o.kind === 'window') return [{ kind: 'polyline', closed: true, layer: 'OPENINGS', points: [[-half, -t], [half, -t], [half, t], [-half, t]] },
    drawingLine([-half, 0], [half, 0], 'OPENINGS')];
  const { mirrorX, mirrorY } = doorOrientation(o), hinge: Point = [-half * mirrorX, 0];
  const a: Point = [-half * mirrorX, -o.width * mirrorY], b: Point = [half * mirrorX, 0];
  return [drawingLine(hinge, a, 'OPENINGS'), { kind: 'arc', layer: 'OPENINGS', center: hinge, radius: o.width,
    start: Math.atan2(a[1] - hinge[1], a[0] - hinge[0]), end: Math.atan2(b[1] - hinge[1], b[0] - hinge[0]), clockwise: mirrorX * mirrorY > 0 }];
}

/** Deduplicates block geometry by signature; same base name with a different signature gets a `_2`, `_3`… suffix. */
function blockRegistry() {
  const bySignature = new Map<string, string>(), used = new Set<string>(), list: DrawingBlock[] = [];
  return {
    list,
    name(base: string, signature: string, entities: DrawingEntity[]) {
      const known = bySignature.get(signature);
      if (known) return known;
      let name = base;
      for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
      used.add(name); bySignature.set(signature, name); list.push({ name, entities });
      return name;
    },
  };
}

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
  const blocks = blockRegistry(), inserts: DrawingInsert[] = [];
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
    const p: Point = [wall.a[0] + ux * o.offset, wall.a[1] + uy * o.offset], rotation = Math.atan2(uy, ux);
    const group = { id: o.id, name: openingKindLabel(o.kind) };
    const { mirrorX, mirrorY } = doorOrientation(o), local = openingDrawing(o, wall.thickness);
    const prefix = o.kind === 'door' ? 'DOOR' : o.kind === 'window' ? 'WIN' : 'PASS';
    const block = blocks.name(`${prefix}_${Math.round(o.width)}x${Math.round(wall.thickness)}`,
      JSON.stringify([o.kind, o.width, wall.thickness, o.kind === 'door' ? [mirrorX, mirrorY] : 0]), local);
    inserts.push({ block, point: p, rotation, layer: 'OPENINGS', groupId: o.id });
    entities.push(...local.map(e => ({ ...transformEntity(e, p, rotation), group })));
  }
  if (layers.furn) for (const f of d.furniture) {
    const group = { id: f.id, name: f.name }, local = furnitureDrawing({ ...f, cx: 0, cy: 0, rot: 0 });
    const point: Point = [f.cx, f.cy], rotation = f.rot * Math.PI / 180;
    const block = blocks.name(`FURN_${f.type.replace(/[^A-Za-z0-9_-]/g, '')}_${Math.round(f.w)}x${Math.round(f.d)}`,
      JSON.stringify([f.type, f.shape ?? '', f.w, f.d, f.stair ?? null]), local);
    inserts.push({ block, point, rotation, layer: 'FURNITURE', groupId: f.id });
    entities.push(...local.map(e => ({ ...transformEntity(e, point, rotation), group })));
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
  const points: Point[] = [];
  for (const e of [...entities, ...dimensions.flatMap(dim => dim.display)]) {
    if (e.kind === 'polyline') points.push(...e.points);
    else if (e.kind === 'arc' || e.kind === 'circle') points.push([e.center[0] - e.radius, e.center[1] - e.radius], [e.center[0] + e.radius, e.center[1] + e.radius]);
    else if (e.kind === 'ellipse') {
      const r = Math.hypot(...e.major);
      points.push([e.center[0] - r, e.center[1] - r], [e.center[0] + r, e.center[1] + r]);
    } else {
      const width = e.text.length * e.height * 0.65, height = e.height * 1.5;
      points.push([e.point[0] - width, e.point[1] - height], [e.point[0] + width, e.point[1] + height]);
    }
  }
  if (layout) points.push([layout.bounds.x, layout.bounds.y], [layout.bounds.x2, layout.bounds.y2]);
  return { entities, dimensions, blocks: blocks.list, inserts, bounds: bbox(points) };
}
