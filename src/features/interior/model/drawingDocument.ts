import { area, bbox, center, length } from './geometry';
import { connectedWallPoly, wallSectionPolygons } from './wallConnections';
import { doorOrientation } from './doorOrientation';
import { arcClockwise, doorSymbol, doorType } from './doorType';
import { openingKindLabel } from './hardMaterials';
import { dimensionSettings } from './dimensionSettings';
import { dimensionLabelOffset, perimeterDimensions } from './perimeterDimensions';
import { formatMeters } from './lengthUnits';
import type { Design, Layers, Opening, Point } from './types';
import { furnitureDrawing, furnitureLayer } from './furnitureDrawing';
import { isStairs, stairSpec } from './stairs';
import { isBearingWall, wallKindName } from './wallPolicy';

export type DrawingLayer = 'WALLS' | 'DEMOLISHED' | 'ROOMS' | 'SEPARATORS' | 'DOORS' | 'WINDOWS' | 'FURNITURE' | 'STAIRS' | 'ROOM_LABELS' | 'DIMENSIONS';
/** Object grouping for vector exports (SVG/PDF). DXF geometry ignores it. */
export interface DrawingGroup { id: string; name: string }
export type DrawingEntity = (
  /** `dashed`：单个对象用虚线（如垭口上方的过梁投影线），其余沿用图层线型。 */
  | { kind: 'polyline'; points: Point[]; closed: boolean; layer: DrawingLayer; dashed?: boolean }
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
export const DRAWING_LAYERS: DrawingLayer[] = ['WALLS', 'DEMOLISHED', 'ROOMS', 'SEPARATORS', 'DOORS', 'WINDOWS', 'FURNITURE', 'STAIRS', 'ROOM_LABELS', 'DIMENSIONS'];
export const DRAWING_LAYER_NAMES: Record<DrawingLayer, string> = {
  WALLS: '墙体', DEMOLISHED: '拆除墙体', ROOMS: '房间', SEPARATORS: '房间分隔线', DOORS: '门', WINDOWS: '窗', FURNITURE: '家具', STAIRS: '楼梯',
  ROOM_LABELS: '房间名称', DIMENSIONS: '尺寸标注',
};
/** 门窗所在图层：门和垭口归 DOORS（A-DOOR），窗归 WINDOWS（A-GLAZ）。 */
export const openingLayer = (o: Pick<Opening, 'kind'>): DrawingLayer => (o.kind === 'window' ? 'WINDOWS' : 'DOORS');
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
  return { ...e, point: at(e.point), rotation: readableRotation(e.rotation + rotation * 180 / Math.PI) };
}
/**
 * 制图规范（GB/T 50001、ISO 128）：文字从图纸下方或右侧阅读。drawing（y 向下）坐标下的角度归一到 [-90°, 90°)，
 * 对应 DXF 角度不落在 (90°, 270°]。文字均为居中对齐，翻转 180° 不改变位置。
 */
export function readableRotation(degrees: number): number {
  const a = ((degrees % 360) + 360) % 360;
  return a >= 90 && a < 270 ? a - 180 : a >= 270 ? a - 360 : a;
}

/** Opening symbol in local coordinates: wall direction is +x, opening centre at the origin. */
export function openingDrawing(o: Opening, thickness: number): DrawingEntity[] {
  const half = o.width / 2, t = thickness / 2, layer = openingLayer(o);
  // 垭口：洞口两侧贯穿墙厚的边线 + 上方过梁投影的虚线（剖切面以上的构件按制图惯例画虚线），没有门扇与开启弧线。
  if (o.kind === 'passage') return [
    ...[-half, half].map(x => drawingLine([x, -t], [x, t], layer)),
    ...[-t, t].map((y): DrawingEntity => ({ kind: 'polyline', points: [[-half, y], [half, y]], closed: false, layer, dashed: true })),
  ];
  if (o.kind === 'window') return [{ kind: 'polyline', closed: true, layer, points: [[-half, -t], [half, -t], [half, t], [-half, t]] },
    drawingLine([-half, 0], [half, 0], layer)];
  // 门：与画布同一份符号（model/doorType.ts）——门扇为直线、开启弧为 ARC、推拉门扇为闭合多段线，全部在 A-DOOR 图层。
  const { leaves, arcs, panels } = doorSymbol(o);
  return [
    ...leaves.map(l => drawingLine(l.from, l.to, layer)),
    ...arcs.map(({ center, radius, from, to }): DrawingEntity => ({ kind: 'arc', layer, center, radius,
      start: Math.atan2(from[1] - center[1], from[0] - center[0]), end: Math.atan2(to[1] - center[1], to[0] - center[0]), clockwise: arcClockwise(center, from, to) })),
    ...panels.map(({ x, y, width, depth }): DrawingEntity => ({ kind: 'polyline', closed: true, layer,
      points: [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]] })),
  ];
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
  // 房间分隔线：无厚度的虚线，划分房间但不是墙。
  for (const s of d.separators ?? [])
    entities.push({ ...drawingLine(s.a, s.b, 'SEPARATORS'), group: { id: s.id, name: '房间分隔线' } });
  for (const o of d.openings) {
    const wall = valid.find(w => w.id === o.wallId);
    if (!wall || d.demolished.includes(wall.id)) continue;
    const L = length(wall), ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
    const p: Point = [wall.a[0] + ux * o.offset, wall.a[1] + uy * o.offset], rotation = Math.atan2(uy, ux);
    const group = { id: o.id, name: openingKindLabel(o.kind) };
    const { mirrorX, mirrorY } = doorOrientation(o), local = openingDrawing(o, wall.thickness);
    // 图块名：单开沿用 DOOR_宽x厚；双开 / 推拉在前缀里写明类型，CAD 里按块名即可区分。
    const type = o.kind === 'door' ? doorType(o) : null;
    const prefix = o.kind === 'door' ? (type === 'single' ? 'DOOR' : `DOOR_${type!.toUpperCase()}`) : o.kind === 'window' ? 'WIN' : 'PASS';
    const block = blocks.name(`${prefix}_${Math.round(o.width)}x${Math.round(wall.thickness)}`,
      JSON.stringify([o.kind, o.width, wall.thickness, o.kind === 'door' ? [type, mirrorX, mirrorY] : 0]), local);
    inserts.push({ block, point: p, rotation, layer: openingLayer(o), groupId: o.id });
    entities.push(...local.map(e => ({ ...transformEntity(e, p, rotation), group })));
  }
  if (layers.furn) for (const f of d.furniture) {
    const group = { id: f.id, name: f.name }, local = furnitureDrawing({ ...f, cx: 0, cy: 0, rot: 0 });
    const point: Point = [f.cx, f.cy], rotation = f.rot * Math.PI / 180, size = `${Math.round(f.w)}x${Math.round(f.d)}`;
    const stairs = isStairs(f), name = stairs ? `STAIR_${stairSpec(f).form.toUpperCase()}_${size}` : `FURN_${f.type.replace(/[^A-Za-z0-9_-]/g, '')}_${size}`;
    // 图块内只放几何：INSERT 旋转会带着块内文字倒置，文字单独写在模型空间（见 dxfExport）。
    const block = blocks.name(name, JSON.stringify([f.type, f.shape ?? '', f.w, f.d, f.stair ?? null]), local.filter(e => e.kind !== 'text'));
    inserts.push({ block, point, rotation, layer: furnitureLayer(f), groupId: f.id });
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
