import { dragStep, stepDelta } from './dragStep';
import { snapFurniture, type AlignmentGuide } from './furnitureAlignment';
import { groupBounds, moveGroup } from './furnitureGroup';
import { blockFurnitureMove, norm } from './geometry';
import type { Design, Furniture, Point } from './types';

/**
 * 可移动单位：单件家具或圈选的一组家具。拖动、吸附、对齐线、挡墙、旋转都按同一套逻辑处理，
 * 单件就是它自己，整组则视为一个外接框（不旋转）的虚拟家具。
 */
export function unitBox(d: Design, ids: string[]): Furniture | null {
  if (ids.length === 1) return d.furniture.find(f => f.id === ids[0]) ?? null;
  const b = groupBounds(d, ids);
  if (!b.length) return null;
  const [[x1, y1], , [x2, y2]] = b as [Point, Point, Point, Point];
  return { id: ids.join('|'), type: 'group', name: '', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, d: y2 - y1, rot: 0, color: '' };
}

/** 吸附 / 挡墙参照的环境：去掉单位自身的家具。 */
const without = (d: Design, ids: string[]): Design => {
  const set = new Set(ids);
  return { ...d, furniture: d.furniture.filter(f => !set.has(f.id)) };
};

/**
 * 拖动单位：位移先按步进取整，再吸附墙面与其他家具（产生对齐线），最后从上一帧位置推进、不嵌进墙。
 * `before` 是拖动开始时的图纸，`last` 是上一帧预览的图纸。
 */
export function dragUnit(before: Design, last: Design, ids: string[], delta: Point, snap: boolean, tol: number): { design: Design; guides: AlignmentGuide[] } {
  const unit = unitBox(before, ids);
  if (!unit) return { design: before, guides: [] };
  const env = without(before, ids), moveBy = stepDelta(delta, dragStep(before));
  const snapped = snapFurniture(unit, [unit.cx + moveBy[0], unit.cy + moveBy[1]], env, snap, tol);
  const prev = unitBox(last, ids) ?? unit;
  const to = blockFurnitureMove(unit, [prev.cx, prev.cy], snapped.point, env);
  return { design: moveGroup(before, ids, [to[0] - unit.cx, to[1] - unit.cy]), guides: snapped.guides };
}

const clean = (v: number) => Math.round(v * 1e6) / 1e6;

/** 绕单位中心旋转：每件家具的中心绕整组中心转动，自身朝向同步加上角度；单件即原地旋转。 */
export function rotateUnit(d: Design, ids: string[], angle: number): Design {
  const unit = unitBox(d, ids);
  if (!unit || !angle) return d;
  const set = new Set(ids), a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return {
    ...d,
    furniture: d.furniture.map(f => {
      if (!set.has(f.id)) return f;
      const dx = f.cx - unit.cx, dy = f.cy - unit.cy;
      return { ...f, cx: clean(unit.cx + dx * cos - dy * sin), cy: clean(unit.cy + dx * sin + dy * cos), rot: norm(f.rot + angle) };
    }),
  };
}
