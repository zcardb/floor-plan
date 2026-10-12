import type { Design } from '@/lib/floor-plan/types';

/** 家具图层：平面图按 design.furniture 的顺序绘制，越靠后越在上层。 */
export type LayerAction = 'front' | 'forward' | 'backward' | 'back';

export interface LayerStatus {
  /** 已在最上层：置顶、上移一层不可用。 */
  atTop: boolean;
  /** 已在最下层：置底、下移一层不可用。 */
  atBottom: boolean;
}

/** 选中家具在图层中的位置；多选时整体看待（相对顺序保持不变）。 */
export function layerStatus(d: Design, ids: string[]): LayerStatus {
  const set = new Set(ids), n = d.furniture.filter(f => set.has(f.id)).length;
  if (!n) return { atTop: true, atBottom: true };
  return {
    atTop: d.furniture.slice(-n).every(f => set.has(f.id)),
    atBottom: d.furniture.slice(0, n).every(f => set.has(f.id)),
  };
}

/**
 * 调整选中家具的图层顺序；多选时组内相对顺序不变。
 * 上移 / 下移一层：每件越过相邻的一件未选中家具（已贴着其它选中件的不再移动）。
 */
export function reorderFurniture(d: Design, ids: string[], action: LayerAction): Design {
  const set = new Set(ids), status = layerStatus(d, ids);
  if (action === 'front' || action === 'forward' ? status.atTop : status.atBottom) return d;
  const picked = d.furniture.filter(f => set.has(f.id)), others = d.furniture.filter(f => !set.has(f.id));
  if (action === 'front') return { ...d, furniture: [...others, ...picked] };
  if (action === 'back') return { ...d, furniture: [...picked, ...others] };
  const list = [...d.furniture];
  if (action === 'forward') {
    for (let i = list.length - 2; i >= 0; i--)
      if (set.has(list[i]!.id) && !set.has(list[i + 1]!.id)) [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
  } else {
    for (let i = 1; i < list.length; i++)
      if (set.has(list[i]!.id) && !set.has(list[i - 1]!.id)) [list[i], list[i - 1]] = [list[i - 1]!, list[i]!];
  }
  return { ...d, furniture: list };
}
