import type { Design, Furniture, Point, Selection } from './types';

export interface Rect { x1: number; y1: number; x2: number; y2: number }

/** 任意方向拖出的两点 → 左上 / 右下规范化的矩形。 */
export function normalizeRect(a: Point, b: Point): Rect {
  return { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) };
}

/** 家具旋转后的四个角点（与选中框一致）。 */
export function furnitureCorners(f: Furniture): Point[] {
  const a = (f.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [
    f.cx + ((x * f.w) / 2) * cos - ((y * f.d) / 2) * sin,
    f.cy + ((x * f.w) / 2) * sin + ((y * f.d) / 2) * cos,
  ]);
}

/** 四个角全部落在框内的家具 id（按图纸顺序）。 */
export function furnitureInRect(d: Design, r: Rect): string[] {
  return d.furniture
    .filter(f => furnitureCorners(f).every(([x, y]) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2))
    .map(f => f.id);
}

/** 圈选结果 → 选择：0 件清空，1 件单选，多件成组。 */
export function selectionOf(ids: string[]): Selection {
  if (!ids.length) return null;
  return ids.length === 1 ? { kind: 'furniture', id: ids[0]! } : { kind: 'group', ids };
}

/** 当前选择里仍存在的成组家具 id；不是成组选择时为空。 */
export function groupIds(d: Design, s: Selection): string[] {
  if (s?.kind !== 'group') return [];
  const alive = new Set(d.furniture.map(f => f.id));
  return s.ids.filter(id => alive.has(id));
}

/** 整组家具的外接框四角（工具条定位与整体虚线框）。 */
export function groupBounds(d: Design, ids: string[]): Point[] {
  const set = new Set(ids);
  const pts = d.furniture.filter(f => set.has(f.id)).flatMap(furnitureCorners);
  if (!pts.length) return [];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const r = { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  return [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]];
}

/** 整组平移同一位移，组内相对位置不变。 */
export function moveGroup(d: Design, ids: string[], delta: Point): Design {
  if (!delta[0] && !delta[1]) return d;
  const set = new Set(ids);
  return { ...d, furniture: d.furniture.map(f => set.has(f.id) ? { ...f, cx: f.cx + delta[0], cy: f.cy + delta[1] } : f) };
}

/** 删除整组家具。 */
export function removeGroup(d: Design, ids: string[]): Design {
  const set = new Set(ids);
  return { ...d, furniture: d.furniture.filter(f => !set.has(f.id)) };
}
