import { boxFromEdges, guidesFor, snapCoordinate, type AlignmentGuide, type Axis, type SnapCandidate } from './alignment';
import { dragStep, snapToDragStep } from './drag-step';
import { furnitureBox } from './furniture-alignment';
import { bbox, wallPoly } from '@/lib/floor-plan/geometry';
import type { Design, Furniture, Point } from '@/lib/floor-plan/types';

/** 家具的四条边（家具自身坐标）：e / w 沿宽度方向，s / n 沿进深方向；n 是旋转手柄所在的一侧。 */
export type FurnitureEdge = 'n' | 's' | 'e' | 'w';
export const FURNITURE_EDGES: readonly FurnitureEdge[] = ['n', 'e', 's', 'w'];
/** 拖边缩放时的最小边长（mm），与角点缩放一致。 */
export const MIN_FURNITURE_SIDE = 100;

/** 每条边对应的家具局部外法向（未旋转）。 */
const NORMAL: Record<FurnitureEdge, Point> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

/**
 * 拖动一条边改尺寸：对边位置不变，只有被拖的边跟随指针，长度按步进取整、不小于最小边长。
 * `f` 为拖动开始时的家具，`p` 为当前指针（图纸坐标）。
 */
export function resizeFurnitureEdge(f: Furniture, edge: FurnitureEdge, p: Point, step: number): Pick<Furniture, 'cx' | 'cy' | 'w' | 'd'> {
  const a = (f.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const [nx, ny] = NORMAL[edge];
  // 外法向转到图纸坐标
  const out: Point = [nx * cos - ny * sin, nx * sin + ny * cos];
  const horizontal = edge === 'e' || edge === 'w';
  const size = horizontal ? f.w : f.d;
  // 指针相对中心沿外法向的距离 + 对边到中心的一半长度 = 新长度
  const along = (p[0] - f.cx) * out[0] + (p[1] - f.cy) * out[1];
  const next = Math.max(MIN_FURNITURE_SIDE, snapToDragStep(along + size / 2, step));
  const shift = (next - size) / 2;
  return {
    cx: f.cx + out[0] * shift,
    cy: f.cy + out[1] * shift,
    w: horizontal ? next : f.w,
    d: horizontal ? f.d : next,
  };
}

/** 边手柄的光标：按边在屏幕上的法向方向取最接近的双向箭头。 */
export function edgeCursor(rot: number, edge: FurnitureEdge): string {
  const base = edge === 'e' || edge === 'w' ? 0 : 90;
  const deg = (((rot + base) % 180) + 180) % 180;
  const idx = Math.round(deg / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][idx];
}

/**
 * 拖边 + 吸附：与整体拖动同一套规则（见 alignment.ts）——被拖的边贴到其他家具的边 / 中线时显示对齐虚线，
 * 也会贴到墙面（墙本身就是参照，不画线）。家具不是横平竖直（旋转非 90° 倍数）时只按步进取整。
 */
export function snapFurnitureEdge(design: Design, f: Furniture, edge: FurnitureEdge, p: Point, snap: boolean, tol: number):
  { patch: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd'>; guides: AlignmentGuide[] } {
  const stepped = resizeFurnitureEdge(f, edge, p, dragStep(design));
  const a = (f.rot * Math.PI) / 180, [nx, ny] = NORMAL[edge];
  const out: Point = [Math.round(nx * Math.cos(a) - ny * Math.sin(a)), Math.round(nx * Math.sin(a) + ny * Math.cos(a))];
  if (!snap || f.rot % 90 !== 0) return { patch: stepped, guides: [] };
  const i: Axis = out[0] !== 0 ? 0 : 1, j: Axis = i === 0 ? 1 : 0, sign = out[i];
  const box = furnitureBox(f), fixed = box.c[i] - sign * box.h[i];
  const others = design.furniture.filter(o => o.id !== f.id).map(furnitureBox);
  // 墙面候选：只取与家具在另一轴上有重叠的墙（与整体拖动的墙吸附一致）。
  let wall: SnapCandidate | undefined;
  const lo = box.c[j] - box.h[j] - tol, hi = box.c[j] + box.h[j] + tol;
  for (const w of design.walls.filter(w => !design.demolished.includes(w.id))) {
    const b = bbox(wallPoly(w)), [b1, b2, c1, c2] = i === 0 ? [b.x, b.x2, b.y, b.y2] : [b.y, b.y2, b.x, b.x2];
    if (c2 < lo || c1 > hi) continue;
    for (const v of [b1, b2]) { const dist = Math.abs(v - p[i]); if (dist < (wall?.dist ?? tol)) wall = { v, dist }; }
  }
  const near = snapCoordinate(p[i], others, i, tol);
  const target = near && (!wall || near.dist <= wall.dist) ? near : wall;
  if (!target || sign * (target.v - fixed) < MIN_FURNITURE_SIDE) return { patch: stepped, guides: [] };
  const size = Math.abs(target.v - fixed), center = (target.v + fixed) / 2;
  const horizontalLocal = edge === 'e' || edge === 'w';
  const patch = {
    cx: i === 0 ? center : f.cx,
    cy: i === 1 ? center : f.cy,
    w: horizontalLocal ? size : f.w,
    d: horizontalLocal ? f.d : size,
  };
  const placed = i === 0 ? boxFromEdges(fixed, target.v, box.c[1] - box.h[1], box.c[1] + box.h[1])
    : boxFromEdges(box.c[0] - box.h[0], box.c[0] + box.h[0], fixed, target.v);
  return { patch, guides: target === near ? guidesFor(placed, others, i) : [] };
}
