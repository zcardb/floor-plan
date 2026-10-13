import { wallPoly } from '@/lib/floor-plan/geometry';
import { validateDesign } from '@/lib/floor-plan/validation';
import { deriveRooms } from '@/lib/floor-plan/room-derive';
import { uid, type Design, type Point, type Wall } from '@/lib/floor-plan/types';
import { unitMm, type DxfSegment, type DxfUnit } from './dxf-source';
import { attachLoose, clusterSymbols, fillCollinearGaps, fillEndGaps, placeOpenings, windowBands, type SymbolSegment } from './openings';
import { enclosedRooms } from './rooms';
import { boundsOf } from './vector';
import { axisWalls, closeJoints, regroupAxes, wallAxes, SINGLE_WALL_THICKNESS } from './walls';

/** 图层在识别中的角色；opening 表示门窗混在一个图层里，按有没有开启弧线自动区分。 */
export type LayerRole = 'wall' | 'door' | 'window' | 'opening' | 'separator' | 'ignore';
export const LAYER_ROLES: { id: LayerRole; label: string }[] = [
  { id: 'wall', label: '墙体' },
  { id: 'door', label: '门' },
  { id: 'window', label: '窗' },
  { id: 'opening', label: '门窗（自动区分）' },
  { id: 'separator', label: '房间分隔线' },
  { id: 'ignore', label: '忽略' },
];
export interface RecognizeOptions { roles: Record<string, LayerRole>; unit: DxfUnit }
export interface Recognition {
  design: Design;
  /** 方案坐标 = 图纸坐标（毫米、Y 向下）+ offset。 */
  offset: Point;
  stats: { walls: number; doors: number; windows: number; rooms: number };
  warnings: string[];
}

/** 识别导入的方案标记，用于在编辑器里显示「CAD 导入户型」。 */
export const DXF_TEMPLATE_ID = 'dxf-import';
const MAX_WALLS = 2000, MAX_EXTENT = 50000, MIN_EXTENT = 500;
/** 图纸坐标（图纸单位、Y 向上）→ 毫米、Y 向下。 */
export const toPlan = (p: Point, mm: number): Point => [p[0] * mm, -p[1] * mm];
const round = (v: number) => Math.round(v * 100) / 100;
const median = (values: number[]) => values.slice().sort((x, y) => x - y)[Math.floor(values.length / 2)];

/**
 * 按图层名猜角色；一个墙图层都没猜到时，除门窗以外的图层都当墙。
 * 兼容 AIA / NCS 标准名（A-WALL、A-DOOR、A-GLAZ、A-AREA-BNDY）与常见中文图层名；拆除、填充图层不参与识别。
 */
export function guessRoles(layers: string[]): Record<string, LayerRole> {
  const guess = (name: string): LayerRole =>
    /demo|拆|patt|hatch|填充/i.test(name) ? 'ignore'
    : /separat|bndy|分隔|分割/i.test(name) ? 'separator'
    : /open|门窗|洞/i.test(name) ? 'opening'
      : /door|门/i.test(name) ? 'door'
        : /win|glaz|窗/i.test(name) ? 'window'
          : /wall|墙|^qt|[-_]qt/i.test(name) ? 'wall' : 'ignore';
  const roles = Object.fromEntries(layers.map(name => [name, guess(name)]));
  if (!layers.some(name => roles[name] === 'wall'))
    for (const name of layers) if (roles[name] === 'ignore' && !/demo|拆|patt|hatch|填充/i.test(name)) roles[name] = 'wall';
  return roles;
}

/** 外部图纸的线条 → 可编辑的方案。识别不出墙体或房间时抛出带原因的错误。 */
export function recognizeDxf(segments: DxfSegment[], { roles, unit }: RecognizeOptions): Recognition {
  const mm = unitMm(unit), warnings: string[] = [];
  const role = (s: DxfSegment) => roles[s.layer] ?? 'ignore';
  const wallLines = segments.filter(s => role(s) === 'wall' && !s.arc).map(s => ({ a: toPlan(s.a, mm), b: toPlan(s.b, mm) }));
  if (!wallLines.length) throw new Error('未识别到墙体：请把墙线所在的图层设为「墙体」');
  const symbols: SymbolSegment[] = segments.flatMap(s => {
    const r = role(s);
    if (r === 'wall' || r === 'ignore' || r === 'separator') return [];
    return [{ a: toPlan(s.a, mm), b: toPlan(s.b, mm), group: s.group, arc: s.arc, kind: r === 'opening' ? 'auto' : r }];
  });

  const { axes, singles } = wallAxes(wallLines);
  const clusters = clusterSymbols(symbols);
  const inGaps = fillCollinearGaps(axes, clusters);
  const bands = windowBands(clusters, axisWalls(axes));
  // 窗带墙和相邻的同厚墙段并成一条轴线，再找墙角处的门洞。
  const merged = regroupAxes([...axisWalls(axes), ...bands.walls]);
  const atEnds = fillEndGaps(merged, clusters);
  const drawn = axisWalls(merged);
  const found = [...inGaps, ...bands.found, ...atEnds, ...attachLoose(drawn, clusters)];
  const pieces = closeJoints(drawn);
  if (!pieces.length) throw new Error('未识别到墙体：请检查单位是否正确，或把墙线所在的图层设为「墙体」');
  if (pieces.length > MAX_WALLS) throw new Error(`识别出 ${pieces.length} 面墙，超过 ${MAX_WALLS} 面上限，请只保留户型所在的图层`);

  // 平移到原点附近：所有墙面的最小角对齐 (0, 0)。
  const raw = boundsOf(pieces.flatMap(p => wallPoly(p as Wall)));
  const width = raw.x2 - raw.x, depth = raw.y2 - raw.y;
  if (Math.max(width, depth) > MAX_EXTENT) throw new Error(`识别范围约 ${Math.round(Math.max(width, depth) / 1000)} m，超过 50 m 上限，请检查单位是否选对`);
  if (Math.min(width, depth) < MIN_EXTENT) throw new Error('识别范围不足 0.5 m，请检查单位是否选对');
  const offset: Point = [-raw.x, -raw.y];
  const move = (p: Point): Point => [round(p[0] + offset[0]), round(p[1] + offset[1])];
  let walls: Wall[] = pieces
    .map(p => ({ id: uid(), a: move(p.a), b: move(p.b), thickness: p.thickness, kind: 'partition' as const }))
    .filter(w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) >= 50);

  const { rooms, exterior } = enclosedRooms(walls);
  if (!rooms.length) throw new Error('墙体没有围合出房间：请检查外墙是否闭合、单位是否正确，或把门窗所在的图层设为门/窗');
  walls = walls.map(w => (exterior.has(w.id) ? { ...w, kind: 'exterior' } : w));

  const placed = placeOpenings(walls, found.map(o => ({ ...o, center: move(o.center), points: o.points.map(move) })));
  const loose = clusters.filter(c => !c.used).length + placed.dropped;
  if (singles) warnings.push(`${singles} 段单线没有配成双线墙，已按 ${SINGLE_WALL_THICKNESS} mm 厚的墙处理`);
  if (loose) warnings.push(`${loose} 处门窗没有找到对应的墙，已跳过，导入后可手动添加`);

  const separators = segments
    .filter(s => role(s) === 'separator' && !s.arc)
    .map(s => ({ id: uid(), a: move(toPlan(s.a, mm)), b: move(toPlan(s.b, mm)) }))
    .filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= 20);

  // 房间由「墙 + 分隔线」重算，名称沿用墙体识别出的房间。
  const design = deriveRooms(validateDesign({
    version: 2,
    template: 'reference',
    templateId: DXF_TEMPLATE_ID,
    width: round(width),
    depth: round(depth),
    thickness: Math.min(1000, Math.max(50, median(walls.map(w => w.thickness)))),
    height: 2800,
    walls,
    openings: placed.openings,
    rooms,
    separators,
    furniture: [],
    demolished: [],
  } satisfies Design));
  return {
    design,
    offset,
    stats: {
      walls: walls.length,
      doors: placed.openings.filter(o => o.kind === 'door').length,
      windows: placed.openings.filter(o => o.kind === 'window').length,
      rooms: design.rooms.length,
    },
    warnings,
  };
}
