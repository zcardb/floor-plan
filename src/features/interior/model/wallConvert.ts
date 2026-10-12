import { length } from './geometry';
import { syncRooms } from './roomFollow';
import { splitAtJunctions } from './wallAutoSplit';
import { validateWallSegment } from './wallDrawing';
import { healSplitsAround } from './wallHeal';
import { isBearingWall } from './wallPolicy';
import { splitTolerance, splitWall } from './wallSplit';
import { uid, type Design, type Opening, type Selection, type Wall } from './types';

/** 墙类构件的三种形态，与「硬装 · 墙」分组同一套：墙 / 垭口 / 房间分隔线。 */
export type WallForm = 'wall' | 'passage' | 'separator';
/** 可在「墙选项」里互相替换的选中对象：墙、分隔线、垭口。 */
export type StructureTarget = { kind: 'wall' | 'separator' | 'opening'; id: string };

/** 洞口宽与墙长相差不超过该值（mm）即视为整面垭口（兼容导入数据的取整）。 */
const FULL_TOLERANCE = 1;
const BEARING_LOCK = '承重墙不可替换，请先取消承重标记';

const isFull = (o: Opening, wall: Wall) => o.kind === 'passage' && Math.abs(o.width - length(wall)) <= FULL_TOLERANCE;
/** 整面墙开成的垭口：洞口宽 = 墙长。 */
const fullPassage = (design: Design, wall: Wall) => design.openings.find(o => o.wallId === wall.id && isFull(o, wall));

export interface StructureForm {
  current: WallForm;
  /** 不可替换为某形态的原因（没有的形态可替换）。 */
  locked: Partial<Record<WallForm, string>>;
}

/** 选中对象当前的形态与锁定原因；不是墙 / 分隔线 / 垭口时返回 null。 */
export function structureForm(design: Design, t: StructureTarget): StructureForm | null {
  if (t.kind === 'separator') return design.separators?.some(s => s.id === t.id) ? { current: 'separator', locked: {} } : null;
  if (t.kind === 'wall') {
    const wall = design.walls.find(w => w.id === t.id);
    if (!wall) return null;
    const current = fullPassage(design, wall) ? 'passage' : 'wall';
    // 承重墙：除了当前形态都锁住（替换会去掉承重墙体）。
    const locked = isBearingWall(wall) ? Object.fromEntries((['wall', 'passage', 'separator'] as const).filter(f => f !== current).map(f => [f, BEARING_LOCK])) : {};
    return { current, locked };
  }
  const o = design.openings.find(x => x.id === t.id);
  const host = o && design.walls.find(w => w.id === o.wallId);
  if (!o || o.kind !== 'passage' || !host) return null;
  // 垭口补回成墙总是可以；换成分隔线会去掉这段墙，承重墙不行。
  return { current: 'passage', locked: isBearingWall(host) ? { separator: BEARING_LOCK } : {} };
}

export interface WallFormResult {
  design: Design;
  /** 替换后应选中的对象。 */
  select: Selection;
  /** 被一并移除的门窗数量（不含被替换的垭口本身）。 */
  removedOpenings: number;
}

/** 整面墙 → 垭口：墙上原有门窗由一个整面垭口取代，房间划分不变。 */
function wallToPassage(design: Design, wall: Wall): WallFormResult {
  const L = length(wall);
  const opening: Opening = { id: uid(), wallId: wall.id, kind: 'passage', offset: L / 2, width: L, open: true };
  const others = design.openings.filter(o => o.wallId === wall.id && !isFull(o, wall));
  return {
    design: { ...design, openings: [...design.openings.filter(o => o.wallId !== wall.id), opening] },
    select: { kind: 'opening', id: opening.id },
    removedOpenings: others.length,
  };
}

/** 整面墙 → 分隔线：删墙（相连墙上的分割点一并合回）+ 同位置补一条分隔线，房间仍按原样划分。 */
function wallToSeparator(design: Design, wall: Wall): WallFormResult {
  if (length(wall) < splitTolerance) throw new Error('墙段太短，无法替换为分隔线');
  const separator = { id: uid(), a: wall.a, b: wall.b };
  const others = design.openings.filter(o => o.wallId === wall.id && !isFull(o, wall));
  const next = syncRooms(design, healSplitsAround({
    ...design,
    walls: design.walls.filter(w => w.id !== wall.id),
    openings: design.openings.filter(o => o.wallId !== wall.id),
    separators: [...(design.separators ?? []), separator],
  }, wall));
  if (!next.rooms.length) throw new Error('替换后将没有房间，无法替换');
  return { design: next, select: { kind: 'separator', id: separator.id }, removedOpenings: others.length };
}

/** 分隔线 → 墙（可再整面开成垭口）：与手绘墙同一套墙厚、交接点分割与房间重算。 */
function separatorToWall(design: Design, id: string, passage: boolean): WallFormResult {
  const s = design.separators?.find(x => x.id === id);
  if (!s) throw new Error('分隔线不存在，请重新选择');
  const rest = { ...design, separators: design.separators!.filter(x => x.id !== id) };
  validateWallSegment(rest, s.a, s.b);
  const wall: Wall = { id: uid(), a: s.a, b: s.b, kind: 'partition', thickness: design.thickness };
  const next = syncRooms(design, splitAtJunctions({ ...rest, walls: [...rest.walls, wall] }, wall.id));
  if (!passage) return { design: next, select: { kind: 'wall', id: wall.id }, removedOpenings: 0 };
  return wallToPassage(next, next.walls.find(w => w.id === wall.id)!);
}

/** 垭口 → 分隔线：只把垭口那一段墙换成分隔线（不是整面时先在洞口两边分段）。 */
function passageToSeparator(design: Design, o: Opening): WallFormResult {
  const host = design.walls.find(w => w.id === o.wallId)!;
  if (isFull(o, host)) return wallToSeparator(design, host);
  const L = length(host), cuts = [o.offset - o.width / 2, o.offset + o.width / 2].filter(c => c > splitTolerance && c < L - splitTolerance);
  const split = splitWall(design, host.id, cuts).design;
  const segment = split.walls.find(w => w.id === split.openings.find(x => x.id === o.id)!.wallId)!;
  return wallToSeparator(split, segment);
}

/**
 * 把墙 / 分隔线 / 垭口替换成另一种形态，均为一次可撤销的改动：
 * - 墙 → 垭口：整面开洞；墙 → 分隔线：去墙留线；
 * - 分隔线 → 墙 / 垭口：按默认墙厚补墙（垭口再整面开洞）；
 * - 垭口 → 墙：补回墙体；垭口 → 分隔线：只把洞口那段换成分隔线。
 */
export function convertStructure(design: Design, t: StructureTarget, to: WallForm): WallFormResult {
  const form = structureForm(design, t);
  if (!form) throw new Error('对象不存在，请重新选择');
  if (form.locked[to]) throw new Error(form.locked[to]);
  const keep: WallFormResult = { design, select: t as Selection, removedOpenings: 0 };
  if (to === form.current) return keep;

  if (t.kind === 'separator') return separatorToWall(design, t.id, to === 'passage');

  if (t.kind === 'wall') {
    const wall = design.walls.find(w => w.id === t.id)!;
    if (to === 'passage') return wallToPassage(design, wall);
    if (to === 'separator') return wallToSeparator(design, wall);
    const passage = fullPassage(design, wall)!;
    return { ...keep, design: { ...design, openings: design.openings.filter(o => o.id !== passage.id) } };
  }

  const o = design.openings.find(x => x.id === t.id)!;
  if (to === 'wall') return { ...keep, design: { ...design, openings: design.openings.filter(x => x.id !== o.id) }, select: { kind: 'wall', id: o.wallId } };
  return passageToSeparator(design, o);
}
