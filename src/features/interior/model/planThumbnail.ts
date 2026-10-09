import type { Design, Furniture, Opening, Point, Room, Wall } from './types';

/**
 * 画平面缩略图需要的最少字段。完整 Design 天然满足（内置模板、本机方案直接传），
 * 云端 thumbnail 列存的就是这份瘦身数据。
 */
export interface ThumbnailDesign {
  width: number;
  depth: number;
  walls: Pick<Wall, 'id' | 'a' | 'b' | 'thickness'>[];
  openings: Pick<Opening, 'id' | 'wallId' | 'kind' | 'offset' | 'width'>[];
  rooms: Pick<Room, 'id' | 'rings'>[];
  furniture: Pick<Furniture, 'id' | 'type' | 'shape' | 'cx' | 'cy' | 'w' | 'd' | 'rot' | 'color'>[];
}

/** 云端存储格式：坐标取整，带版本号便于以后升级。 */
export interface StoredThumbnail extends ThumbnailDesign { v: 1 }

const n = Math.round;
const pt = ([x, y]: Point): Point => [n(x), n(y)];

export function compactThumbnail(d: Design): StoredThumbnail {
  return {
    v: 1,
    width: n(d.width),
    depth: n(d.depth),
    walls: d.walls.map(w => ({ id: w.id, a: pt(w.a), b: pt(w.b), thickness: n(w.thickness) })),
    openings: d.openings.map(o => ({ id: o.id, wallId: o.wallId, kind: o.kind, offset: n(o.offset), width: n(o.width) })),
    rooms: d.rooms.map(r => ({ id: r.id, rings: r.rings.slice(0, 1).map(ring => ring.map(pt)) })),
    furniture: d.furniture.map(f => ({ id: f.id, type: f.type, ...(f.shape ? { shape: f.shape } : {}), cx: n(f.cx), cy: n(f.cy), w: n(f.w), d: n(f.d), rot: n(f.rot), color: f.color })),
  };
}

/** 读取时校验：坏数据或旧格式直接当作没有缩略图，退回占位。 */
export function readThumbnail(value: unknown): ThumbnailDesign | null {
  const t = value as Partial<StoredThumbnail> | null;
  if (!t || typeof t !== 'object' || t.v !== 1 || !Array.isArray(t.walls) || !Array.isArray(t.rooms) || !Array.isArray(t.furniture) || !Array.isArray(t.openings)) return null;
  return t as StoredThumbnail;
}

const PAD = 400;

/** 按真实几何算外框：导入的图纸坐标常有偏移，只用 width/depth 会裁掉或留大片空白。 */
export function thumbnailBounds(d: ThumbnailDesign) {
  const xs: number[] = [], ys: number[] = [];
  for (const w of d.walls) { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]); }
  for (const r of d.rooms) for (const [x, y] of r.rings[0] ?? []) { xs.push(x); ys.push(y); }
  for (const f of d.furniture) { const e = Math.max(f.w, f.d) / 2; xs.push(f.cx - e, f.cx + e); ys.push(f.cy - e, f.cy + e); }
  if (!xs.length) return { x: 0, y: 0, w: d.width || 1, h: d.depth || 1 };
  const x = Math.min(...xs) - PAD, y = Math.min(...ys) - PAD;
  return { x, y, w: Math.max(...xs) - x + PAD, h: Math.max(...ys) - y + PAD };
}

export interface ThumbnailSegment { key: string; a: Point; b: Point; width: number }

/** 墙线在门窗处断开：门留洞，窗单独画一条细线。 */
export function wallPieces(d: ThumbnailDesign): { walls: ThumbnailSegment[]; windows: ThumbnailSegment[] } {
  const walls: ThumbnailSegment[] = [], windows: ThumbnailSegment[] = [];
  for (const w of d.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) continue;
    const at = (t: number): Point => [w.a[0] + (w.b[0] - w.a[0]) * t / len, w.a[1] + (w.b[1] - w.a[1]) * t / len];
    let pos = 0;
    for (const o of d.openings.filter(o => o.wallId === w.id).sort((a, z) => a.offset - z.offset)) {
      const start = Math.max(pos, o.offset - o.width / 2), end = Math.min(len, o.offset + o.width / 2);
      if (end <= start) continue;
      if (start > pos) walls.push({ key: w.id + ':' + pos, a: at(pos), b: at(start), width: w.thickness });
      if (o.kind === 'window') windows.push({ key: o.id, a: at(start), b: at(end), width: Math.max(8, w.thickness / 3) });
      pos = end;
    }
    if (pos < len) walls.push({ key: w.id + ':' + pos, a: at(pos), b: w.b, width: w.thickness });
  }
  return { walls, windows };
}
