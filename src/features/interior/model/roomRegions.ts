import polygonClipping from 'polygon-clipping';
import { length, ringArea, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { stripStrayHoles } from './roomHoles';
import { uid, type Design, type Point, type Room } from './types';

/** 墙端与另一面墙之间小于这个缝隙（mm）时视为已连上：画图误差、视觉上相接的墙都按连接处理。 */
export const JOIN_TOLERANCE = 60;
/** 小于这个面积（mm²，即 1 m²）的区域不算房间：管井、墙垛碎块。 */
const MIN_AREA = 1_000_000;
/** 平均宽度（≈ 2 × 面积 / 周长）小于它的是房间轮廓与墙面之间的细缝，不算房间。 */
const MIN_WIDTH = 300;

const perimeter = (ring: Point[]) => ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length]!;
  return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
}, 0);
export const netArea = (rings: Point[][]) => ringArea(rings[0]!) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);
export const openRing = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/** 一块区域够不够当房间：面积 ≥ 1 m²、平均宽度 ≥ 300 mm。 */
export const significantRings = (rings: Point[][]) =>
  rings[0]!.length >= 3 && netArea(rings) >= MIN_AREA && (2 * netArea(rings)) / perimeter(rings[0]!) >= MIN_WIDTH;

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
const baseName = (name: string) => name.replace(/\s+\d+$/, '').trim() || '房间';
export function freeName(base: string, taken: Set<string>) {
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/**
 * 被墙隔成几块的房间按墙拆开：墙已经把一个房间分成两块以上（各自够房间大小）时，
 * 面积最大的一块保留原房间（id、名称、材质），其余作为新房间（同材质，名称加序号）。
 * 没被隔开的房间原样保留（包括轮廓与墙略有重叠的情况）。
 */
export function splitRoomsByWalls(d: Design, footprints = wallFootprints(d)): Design {
  if (!footprints.length || !d.rooms.length) return d;
  const names = new Set(d.rooms.map(r => r.name));
  const kept: Room[] = [], added: Room[] = [];
  let changed = false;
  for (const room of d.rooms) {
    let pieces: Point[][][] = [];
    try {
      if (room.rings[0] && room.rings[0].length >= 3)
        pieces = (polygonClipping.difference(room.rings, ...footprints.map(p => [p])) as Point[][][])
          .map(poly => poly.map(openRing))
          .filter(significantRings)
          .sort((a, b) => netArea(b) - netArea(a));
    } catch { pieces = []; }
    if (pieces.length < 2) { kept.push(room); continue; }
    changed = true;
    kept.push({ ...room, rings: pieces[0]! });
    for (const rings of pieces.slice(1)) {
      const name = freeName(baseName(room.name), names);
      names.add(name);
      added.push({ id: uid(), name, rings, mat: room.mat, wallMat: room.wallMat, counted: room.counted });
    }
  }
  return changed ? stripStrayHoles({ ...d, rooms: [...kept, ...added] }) : d;
}
