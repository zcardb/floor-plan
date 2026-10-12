import { length, ringArea, wallPoly } from './geometry';
import { connectedWallPoly } from './wall-connections';
import type { Design, Point } from './types';

/** 墙端与另一面墙之间小于这个缝隙（mm）时视为已连上：画图误差、视觉上相接的墙都按连接处理。 */
export const JOIN_TOLERANCE = 60;
export const netArea = (rings: Point[][]) => ringArea(rings[0]!) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);
export const openRing = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/**
 * 划分房间用的墙体足迹：转角斜接后的墙面，再沿墙长两端各伸出 JOIN_TOLERANCE，
 * 把视觉上相接、实际差几厘米的墙也连成闭合边界。矮墙不分隔房间。
 */
export function wallFootprints(d: Design): Point[][] {
  return d.walls
    .filter(w => !d.demolished.includes(w.id) && w.kind !== 'low' && length(w) > 0.01)
    .flatMap(w => [connectedWallPoly(w, d.walls, d.demolished), wallPoly(w, JOIN_TOLERANCE)]);
}

/** 房间名去掉序号后缀，便于切分后按「卧室 2 / 卧室 3」续名。 */
export const baseName = (name: string) => name.replace(/\s+\d+$/, '').trim() || '房间';
export function freeName(base: string, taken: Set<string>) {
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}
