import polygonClipping from 'polygon-clipping';
import { bbox, inRing, rect, ringArea } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { uid, type Design, type Point, type Room } from './types';

/** 小于这个面积（mm²，即 1 m²）的围合区域不建房间：管井、墙垛碎块。 */
const MIN_AREA = 1_000_000;
/** 平均宽度（≈ 2 × 面积 / 周长）小于它的是房间轮廓与墙面之间的细缝，不建房间。 */
const MIN_WIDTH = 300;
const FRAME_MARGIN = 1000;

const openRing = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};
const perimeter = (ring: Point[]) => ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length]!;
  return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
}, 0);
const netArea = (rings: Point[][]) => ringArea(rings[0]!) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);

/**
 * 被墙围起来、却不属于任何房间的区域（参考 / AI / 导入户型里加墙隔出的空间），补成新房间。
 * 区域 = 外框 − 全部墙体 − 室外 − 已有房间；面积 < 1 m² 或平均宽度 < 300 mm 的碎块忽略。
 * 已有房间一律不动；空白户型由 rebuildRooms 负责，这里直接返回。
 */
export function addEnclosedRooms(d: Design): Design {
  if (d.template === 'blank') return d;
  const standing = d.walls.filter(w => !d.demolished.includes(w.id) && w.kind !== 'low');
  if (!standing.length) return d;
  const box = bbox(standing.flatMap(w => [w.a, w.b]));
  const frame = rect(box.x - FRAME_MARGIN, box.y - FRAME_MARGIN, box.x2 - box.x + FRAME_MARGIN * 2, box.y2 - box.y + FRAME_MARGIN * 2);
  let pieces: Point[][][];
  try {
    const regions = polygonClipping.difference([frame], ...standing.map(w => [connectedWallPoly(w, d.walls, d.demolished)])) as Point[][][];
    const probe: Point = [frame[0]![0] + 1, frame[0]![1] + 1];
    const enclosed = regions.filter(region => !inRing(probe, region[0]!));
    if (!enclosed.length) return d;
    const covered = d.rooms.filter(r => r.rings[0] && r.rings[0].length >= 3).map(r => r.rings);
    pieces = (covered.length ? polygonClipping.difference(enclosed, ...covered) : enclosed) as Point[][][];
  } catch {
    return d;
  }
  const names = new Set(d.rooms.map(r => r.name));
  const nextName = () => {
    for (let i = 1; ; i++) {
      const name = i === 1 ? '房间' : `房间 ${i}`;
      if (!names.has(name)) { names.add(name); return name; }
    }
  };
  const added: Room[] = pieces
    .map(poly => poly.map(openRing))
    .filter(rings => rings[0]!.length >= 3 && netArea(rings) >= MIN_AREA && (2 * netArea(rings)) / perimeter(rings[0]!) >= MIN_WIDTH)
    .sort((a, b) => netArea(b) - netArea(a))
    .map(rings => ({ id: uid(), name: nextName(), rings, mat: 'wood' }));
  return added.length ? { ...d, rooms: [...d.rooms, ...added] } : d;
}
