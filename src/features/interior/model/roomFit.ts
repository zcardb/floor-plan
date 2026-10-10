import { bbox, inRing } from './geometry';
import type { Furniture, Point, Room } from './types';

/** 判断时把占地向内收一点，贴墙（边界上）的家具不算出界。 */
const INSET = 5;
/** 找新位置时的搜索步长（mm）。 */
const STEP = 50;

/** 家具占地的四个角（按旋转角）。 */
export function footprintCorners(f: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd' | 'rot'>, inset = 0): Point[] {
  const a = (f.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const hw = Math.max(0, f.w / 2 - inset), hd = Math.max(0, f.d / 2 - inset);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [f.cx + x! * cos - y! * sin, f.cy + x! * sin + y! * cos]);
}

const inside = (p: Point, room: Room) => inRing(p, room.rings[0]!) && !room.rings.slice(1).some(h => inRing(p, h));

/**
 * 占地是否整块落在房间轮廓内：四角都在房间里，且房间轮廓（含洞）的顶点没有戳进占地。
 * 房间多为直角多边形，这两条足以排除「跨过 L 形缺口、压到隔壁房间」的情况。
 */
export function fitsInRoom(f: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd' | 'rot'>, room: Room): boolean {
  if (!room.rings[0] || room.rings[0].length < 3) return false;
  const corners = footprintCorners(f, INSET);
  if (!corners.every(p => inside(p, room))) return false;
  return !room.rings.some(ring => ring.some(v => inRing(v, corners)));
}

/** 离原位最近、能整块放进房间的中心点；房间里哪儿都放不下时返回 null。 */
function nearestFit(f: Furniture, room: Room): Point | null {
  const b = bbox(room.rings[0]!);
  const candidates: { p: Point; dist: number }[] = [];
  for (let x = b.x; x <= b.x2; x += STEP)
    for (let y = b.y; y <= b.y2; y += STEP)
      candidates.push({ p: [x, y], dist: Math.hypot(x - f.cx, y - f.cy) });
  candidates.sort((m, n) => m.dist - n.dist);
  return candidates.find(c => fitsInRoom({ ...f, cx: c.p[0], cy: c.p[1] }, room))?.p ?? null;
}

/**
 * 把家具收进目标房间：已经整块在房间里的原样保留；越界（跨到 L 形缺口外、隔壁房间）的
 * 平移到离原位最近、能整块放下的位置。房间里实在放不下的件数在 dropped 里返回，不摆进别的房间。
 */
export function fitFurnitureIntoRoom(furniture: Furniture[], room: Room): { furniture: Furniture[]; moved: number; dropped: number } {
  let moved = 0, dropped = 0;
  const kept: Furniture[] = [];
  for (const f of furniture) {
    if (fitsInRoom(f, room)) { kept.push(f); continue; }
    const p = nearestFit(f, room);
    if (!p) { dropped++; continue; }
    moved++;
    kept.push({ ...f, cx: p[0], cy: p[1] });
  }
  return { furniture: kept, moved, dropped };
}
