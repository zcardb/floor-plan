import { inRoom, length, rebuildRooms } from './geometry';
import { openRoomIds } from './roomEnclosure';
import { clearRoomFurniture } from './roomFurniture';
import { stripStrayHoles } from './roomHoles';
import { healSplitsAround } from './wallHeal';
import { canDeleteWall } from './wallPolicy';
import { splitWall } from './wallSplit';
import { wallContacts } from './wallContacts';
import type { Design, Point, Wall } from './types';

/** 采样点离墙面的距离（mm）：落在墙两侧的房间里。 */
const SIDE_GAP = 80;
/** 沿墙采样间距（mm）：足够密，短短一截与其它房间相邻也能识别为共用。 */
const SAMPLE_STEP = 100;
/** 采样点离墙段两端的距离（mm）。 */
const END_GAP = 30;

type Owner = 'own' | 'shared' | 'none';
interface Run { from: number; to: number; owner: Owner }

/** 墙段 [from, to] 两侧挨着哪些房间：只挨着目标房间 = own；还挨着其它房间 = shared。 */
function ownerOf(d: Design, wall: Wall, roomId: string, from: number, to: number): Owner {
  const L = length(wall), u: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L], n: Point = [-u[1], u[0]];
  const gap = Math.min(END_GAP, (to - from) / 2);
  const start = from + gap, end = to - gap;
  const count = Math.max(1, Math.ceil((end - start) / SAMPLE_STEP));
  let target = false, other = false;
  for (let i = 0; i <= count && !(target && other); i++) {
    const s = start + ((end - start) * i) / count;
    for (const side of [-1, 1]) {
      const k = side * (wall.thickness / 2 + SIDE_GAP);
      const p: Point = [wall.a[0] + u[0] * s + n[0] * k, wall.a[1] + u[1] * s + n[1] * k];
      for (const r of d.rooms) if (inRoom(p, r)) { if (r.id === roomId) target = true; else other = true; }
    }
  }
  return target ? (other ? 'shared' : 'own') : 'none';
}

/** 沿墙按交接点切开后，把「是否独立」相同的相邻段合并成连续区间。 */
function wallRuns(d: Design, wall: Wall, roomId: string): Run[] {
  const L = length(wall);
  const cuts = wallContacts(d, wall.id).filter(c => c.wallIds.length && !c.blocked).map(c => c.offset);
  const bounds = [0, ...cuts, L];
  const runs: Run[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const owner = ownerOf(d, wall, roomId, bounds[i]!, bounds[i + 1]!);
    const last = runs[runs.length - 1];
    if (last && (last.owner === 'own') === (owner === 'own')) last.to = bounds[i + 1]!;
    else runs.push({ from: bounds[i]!, to: bounds[i + 1]!, owner });
  }
  return runs;
}

const standing = (d: Design) => d.walls.filter(w => !d.demolished.includes(w.id) && length(w) > 1);

/** 整面都是房间独立墙的墙段 id：只围着这一间房间（另一侧是室外或同一房间），与其它房间共用的墙不算。 */
export function roomOwnWalls(d: Design, roomId: string): string[] {
  return standing(d)
    .filter(w => { const runs = wallRuns(d, w, roomId); return runs.length === 1 && runs[0]!.owner === 'own'; })
    .map(w => w.id);
}

/** 房间的独立墙段：跨房间的墙在归属变化处切开，只取属于本房间的那几段；承重墙不动。 */
function ownPieces(d: Design, roomId: string): { design: Design; pieces: Wall[]; protectedWalls: number } {
  let design = d;
  const pieces: Wall[] = [];
  let protectedWalls = 0;
  for (const wall of standing(d)) {
    const runs = wallRuns(design, wall, roomId);
    if (!runs.some(r => r.owner === 'own')) continue;
    if (!canDeleteWall(wall)) { protectedWalls++; continue; }
    if (runs.length === 1) { pieces.push(wall); continue; }
    // 分割时原 id 留在第一段，其余段按顺序紧跟在原位置。
    const index = design.walls.findIndex(w => w.id === wall.id);
    try {
      design = splitWall(design, wall.id, runs.slice(1).map(r => r.from)).design;
    } catch {
      protectedWalls++;
      continue;
    }
    const segments = design.walls.slice(index, index + runs.length);
    runs.forEach((r, i) => { if (r.owner === 'own') pieces.push(segments[i]!); });
  }
  return { design, pieces, protectedWalls };
}

export interface RoomRemoval {
  design: Design;
  /** 删除的独立墙段数。 */
  removedWalls: number;
  /** 因承重保护而保留的独立墙段数。 */
  protectedWalls: number;
  /** 一并删除的家具件数。 */
  furniture: number;
  /** 删除后与本房间原位置连通、不再被墙围住的相邻房间（保留，仅提示）。 */
  exposed: string[];
}

/**
 * 删除房间：清掉房内家具，删除只属于这个房间的墙（含外墙；与其它房间共用的墙保留），墙上门窗一并删除。
 * 一面墙跨多个房间时只切下属于本房间的那一段。承重墙保留。
 * 其它房间一律保留；删完后这块区域仍被承重墙 / 共用墙围住时整次拒绝，不留半拆状态。
 */
export function removeRoom(design: Design, roomId: string): RoomRemoval {
  const room = design.rooms.find(r => r.id === roomId);
  if (!room) throw new Error('房间不存在，请重新选择');
  if (design.rooms.length <= 1) throw new Error('至少保留一个房间');
  const cleared = clearRoomFurniture(design, roomId);
  const { design: cut, pieces, protectedWalls } = ownPieces(cleared, roomId);
  if (!pieces.length)
    throw new Error(protectedWalls ? '这个房间的独立墙都是承重墙，无法删除房间' : '这个房间四周都是共用墙，无法删除房间；可先删除其中一面墙');
  const ids = new Set(pieces.map(w => w.id));
  let next: Design = {
    ...cut,
    walls: cut.walls.filter(w => !ids.has(w.id)),
    openings: cut.openings.filter(o => !ids.has(o.wallId)),
  };
  const wasOpen = openRoomIds(design), opened = openRoomIds(next);
  if (!opened.has(roomId))
    throw new Error('删除独立墙后这块区域仍被承重墙或共用墙围合，无法删除房间');
  const exposed = design.rooms.filter(r => r.id !== roomId && opened.has(r.id) && !wasOpen.has(r.id)).map(r => r.name);
  for (const wall of pieces) next = healSplitsAround(next, wall);
  next = rebuildRooms({ ...next, rooms: next.rooms.filter(r => r.id !== roomId) });
  if (!next.rooms.length) throw new Error('删除后将没有房间，无法删除这个房间');
  next = stripStrayHoles(next);
  return { design: next, removedWalls: pieces.length, protectedWalls, furniture: design.furniture.length - next.furniture.length, exposed };
}
