import polygonClipping from 'polygon-clipping';
import { area, bbox, inRoom, length, rect, ringArea, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import type { Design, Point, Room, Wall } from './types';

/** 房间环与墙面之间可容忍的建模误差（mm），与 roomEnclosure 的墙端缝隙容差一致。 */
const GAP_TOLERANCE = 50;
/** 并集里小于该面积的碎块视为误差（mm²），与 rebuildRooms 的房间面积阈值一致。 */
const MIN_ROOM_AREA = 10000;

/** 沿墙方向的探测间距（mm）：比最窄的房间还小，长墙一侧挨着几间房都能探到。 */
const PROBE_STEP = 200;
/** 法向探测距离（相对墙中心线，mm）：先近后远，兼容墙心两侧厚度不同的情况。 */
const probeDistances = (thickness: number) => [thickness / 2 + 40, thickness / 2 + 150, thickness / 2 + 400];

/** 沿墙中心线的探测位置：两端各让出一个墙厚，避开转角处相邻墙另一侧的房间。 */
function probeOffsets(L: number, thickness: number): number[] {
  const margin = Math.min(thickness, L / 4);
  const span = L - margin * 2;
  const count = Math.max(1, Math.ceil(span / PROBE_STEP));
  return Array.from({ length: count + 1 }, (_, i) => margin + (span * i) / count);
}

const openRing = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/** 墙某一侧探测到的房间 id。房间环是净空轮廓，所以从墙中心线往法向走半个墙厚多一点就落在房间里。 */
function roomIdsBeside(d: Design, wall: Wall, side: 1 | -1): Set<string> {
  const ids = new Set<string>();
  const L = length(wall);
  if (L < 1) return ids;
  const dx = (wall.b[0] - wall.a[0]) / L, dy = (wall.b[1] - wall.a[1]) / L;
  const normal: Point = [-dy * side, dx * side];
  for (const along of probeOffsets(L, wall.thickness))
    for (const distance of probeDistances(wall.thickness)) {
      const p: Point = [wall.a[0] + dx * along + normal[0] * distance, wall.a[1] + dy * along + normal[1] * distance];
      const hit = d.rooms.find(room => inRoom(p, room));
      if (hit) { ids.add(hit.id); break; }
    }
  return ids;
}

/**
 * 房间环与这面墙的墙带求并集。
 * 墙带两侧各加宽 GAP_TOLERANCE，盖住房间环与墙面之间的建模误差（实际数据里常见 10 mm 左右）；
 * 加宽后伸进相邻墙体的部分再用剩余墙体裁掉，所以不会把房间画进墙里。
 * 并出来不是一整块（= 两侧房间其实还被别的墙隔着、或几何不干净）时返回 undefined，调用方保持原样，不冒乱并的风险。
 */
function mergedRings(parts: Room[], wall: Wall, before: Design, after: Design): Point[][] | undefined {
  try {
    const band = connectedWallPoly(wall, before.walls, before.demolished);
    // 加宽部分只保留在参与合并的房间范围内，墙比房间长的那一截不会多出一圈边。
    const extent = bbox(parts.flatMap(r => r.rings[0]!));
    const widened = polygonClipping.intersection(
      [wallPoly({ ...wall, thickness: wall.thickness + GAP_TOLERANCE * 2 })],
      [rect(extent.x, extent.y, extent.x2 - extent.x, extent.y2 - extent.y)],
    );
    const reach = bbox(wallPoly({ ...wall, thickness: wall.thickness + GAP_TOLERANCE * 2 }));
    const walls = after.walls
      .filter(w => !after.demolished.includes(w.id) && length(w) > 0.01)
      .map(w => connectedWallPoly(w, after.walls, after.demolished))
      .filter(poly => { const b = bbox(poly); return b.x <= reach.x2 && b.x2 >= reach.x && b.y <= reach.y2 && b.y2 >= reach.y; });
    const union = polygonClipping.union(parts[0]!.rings, ...parts.slice(1).map(r => r.rings), [band], ...widened);
    const merged = (walls.length ? polygonClipping.difference(union, ...walls.map(p => [p])) : union) as Point[][][];
    const pieces = merged.filter(poly => ringArea(poly[0]!) > MIN_ROOM_AREA);
    if (pieces.length !== 1) return undefined;
    const rings = pieces[0]!.map(openRing);
    return rings[0] && rings.every(r => r.length >= 3) ? rings : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 墙被删掉后把墙两侧的房间并成一间：合并后的轮廓 = 两侧房间环 + 这面墙的墙带（含接缝斜接），
 * 中间不再留下那条墙带宽的空隙。名称 / 地面 / 墙面 / 屋面 / 吊顶材质与计价开关取面积较大的那一间，
 * 房间顺序保持它原来的位置，另一间从列表里删除。
 * 墙两侧是同一个房间（墙垛缺口）时只把这间房间的缺口补上。
 * 墙的一侧没有房间（外围墙、外圈）或几何无法安全合并时原样返回。
 */
export function mergeRoomsAcrossWall(after: Design, before: Design, wall: Wall): Design {
  if (after.template === 'blank') return after;
  const near = roomIdsBeside(after, wall, 1), far = roomIdsBeside(after, wall, -1);
  if (!near.size || !far.size) return after;
  const ids = new Set([...near, ...far]);
  const parts = after.rooms.filter(r => ids.has(r.id));
  if (!parts.length) return after;
  const rings = mergedRings(parts, wall, before, after);
  if (!rings) return after;
  const keep = parts.reduce((a, b) => (area(b) > area(a) ? b : a));
  return {
    ...after,
    rooms: after.rooms
      .map(r => (r.id === keep.id ? { ...r, rings } : r))
      .filter(r => r.id === keep.id || !ids.has(r.id)),
  };
}
