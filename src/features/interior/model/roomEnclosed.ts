import polygonClipping from 'polygon-clipping';
import { bbox, inRing, rect } from './geometry';
import { netArea, openRing, significantRings, splitRoomsByWalls, wallFootprints } from './roomRegions';
import { uid, type Design, type Point, type Room } from './types';

const FRAME_MARGIN = 1000;

/**
 * 被墙围起来、却不属于任何房间的区域（参考 / AI / 导入户型里加墙隔出的空间），补成新房间。
 * 区域 = 外框 − 全部墙体 − 室外 − 已有房间；面积 < 1 m² 或平均宽度 < 300 mm 的碎块忽略。
 * 已有房间一律不动；空白户型由 rebuildRooms 负责，这里直接返回。
 */
export function addEnclosedRooms(d: Design, footprints = wallFootprints(d)): Design {
  if (d.template === 'blank' || !footprints.length) return d;
  const box = bbox(footprints.flat());
  const frame = rect(box.x - FRAME_MARGIN, box.y - FRAME_MARGIN, box.x2 - box.x + FRAME_MARGIN * 2, box.y2 - box.y + FRAME_MARGIN * 2);
  let pieces: Point[][][];
  try {
    const regions = polygonClipping.difference([frame], ...footprints.map(poly => [poly])) as Point[][][];
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
    .filter(significantRings)
    .sort((a, b) => netArea(b) - netArea(a))
    .map(rings => ({ id: uid(), name: nextName(), rings, mat: 'wood' }));
  return added.length ? { ...d, rooms: [...d.rooms, ...added] } : d;
}

/**
 * 非空白户型改墙后让房间与墙一致：被墙隔开的房间拆开，围出的空白区域补成房间。
 * 视觉上相接（差几厘米）的墙按已连接处理。
 */
export function reconcileRoomsWithWalls(d: Design): Design {
  if (d.template === 'blank') return d;
  const footprints = wallFootprints(d);
  return addEnclosedRooms(splitRoomsByWalls(d, footprints), footprints);
}
