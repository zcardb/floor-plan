import { length } from "./geometry";
import { connectedWallPoly } from './wall-connections';
import { doorSwingPoints } from './door-type';
import { furnitureCorners, groupBounds } from './furniture-group';
import type { Design, Point, Selection } from "./types";
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  local?: {x:number;y:number};
}
export function selectionPoints(d: Design, s: Selection): Point[] {
  if (!s) return [];
  if (s.kind === "group") return groupBounds(d, s.ids);
  if (s.kind === "furniture") {
    const f = d.furniture.find((f) => f.id === s.id);
    if (!f) return [];
    return furnitureCorners(f);
  }
  if (s.kind === "room")
    return d.rooms.find((r) => r.id === s.id)?.rings[0] || [];
  if (s.kind === "wall") {
    const w = d.walls.find((w) => w.id === s.id);
    return w ? connectedWallPoly(w, d.walls, d.demolished) : [];
  }
  if (s.kind === "separator") {
    const line = d.separators?.find((l) => l.id === s.id);
    return line ? [line.a, line.b] : [];
  }
  const o = d.openings.find((o) => o.id === s.id),
    w = d.walls.find((w) => w.id === o?.wallId);
  if (!o || !w) return [];
  const L = length(w), dx = (w.b[0]-w.a[0])/L, dy = (w.b[1]-w.a[1])/L;
  const points: Point[] = [[-o.width/2,-w.thickness/2],[o.width/2,-w.thickness/2],[o.width/2,w.thickness/2],[-o.width/2,w.thickness/2]];
  if (o.kind === 'door') points.push(...doorSwingPoints(o));
  return points.map(([x,y]) => [w.a[0]+dx*(o.offset+x)-dy*y,w.a[1]+dy*(o.offset+x)+dx*y]);
}
export function localWallPoint(d: Design, id: string, fraction: number): Point | null {
  const w=d.walls.find(w=>w.id===id);if(!w)return null;
  const t=Math.max(0,Math.min(1,fraction));
  return [w.a[0]+(w.b[0]-w.a[0])*t,w.a[1]+(w.b[1]-w.a[1])*t];
}
export function placeEditor(
  object: ScreenRect | null,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  obstacles: ScreenRect[] = [],
  /** 选中对象附带、必须保持可见的标注（如门窗两侧距离）：与之重叠的计分同障碍物。 */
  keepVisible: ScreenRect[] = [],
) {
  if (
    !object ||
    object.right < 0 ||
    object.bottom < 0 ||
    object.left > viewport.width ||
    object.top > viewport.height
  )
    return null;
  const gap = 12,
    pad = 10,
    maxX = Math.max(pad, viewport.width - size.width - pad),
    maxY = Math.max(pad, viewport.height - size.height - pad);
  const around = (box: ScreenRect) => {
    const left = box.local?.x ?? box.left, right = box.local?.x ?? box.right;
    const top = box.local?.y ?? box.top, bottom = box.local?.y ?? box.bottom;
    return [
      [right + gap, bottom + gap],
      [left, bottom + gap],
      [left, top - size.height - gap],
      [left - size.width - gap, top],
      [right + gap, top],
    ];
  };
  // 有标注时，再围绕「对象 ∪ 标注」的外接矩形取同样的 5 个候选位置。
  const union: ScreenRect | null = keepVisible.length ? {
    left: Math.min(object.left, ...keepVisible.map(r => r.left)),
    top: Math.min(object.top, ...keepVisible.map(r => r.top)),
    right: Math.max(object.right, ...keepVisible.map(r => r.right)),
    bottom: Math.max(object.bottom, ...keepVisible.map(r => r.bottom)),
  } : null;
  const candidates = [...around(object), ...(union ? around(union) : [])];
  const blocked = [...obstacles, ...keepVisible];
  const clamp = (v: number, max: number) => Math.max(pad, Math.min(max, v));
  const overlap = (a: ScreenRect, b: ScreenRect) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return candidates
    .map(([x, y], index) => {
      const left = clamp(x, maxX),
        top = clamp(y, maxY),
        r = { left, top, right: left + size.width, bottom: top + size.height };
      return {
        x: left,
        y: top,
        score:
          blocked.reduce((s, o) => s + overlap(r, o) * 10, 0) +
          overlap(r, object) +
          Math.abs(x - left) +
          Math.abs(y - top) +
          index * 0.01,
      };
    })
    .sort((a, b) => a.score - b.score)[0];
}
