import { length } from './geometry';
import type { Design, Furniture, Point, Wall } from './types';

/** 家具边与墙面的最大间隙（mm），以内视为贴墙。 */
const ATTACH_GAP = 50;
/** 家具边与墙平行的角度容差（°）。 */
const ANGLE_TOLERANCE = 1;

const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];

/** 家具是否贴着墙（任一侧）：边与墙平行、离墙面不超过 ATTACH_GAP、沿墙方向与墙段有重叠。 */
export function touchesWall(f: Furniture, w: Wall): boolean {
  const L = length(w);
  if (L < 1) return false;
  const u: Point = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const n: Point = [-u[1], u[0]];
  const wallAngle = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  const diff = (((f.rot - wallAngle) % 90) + 90) % 90;
  if (Math.min(diff, 90 - diff) > ANGLE_TOLERANCE) return false;
  // 家具 w 边与墙平行时，垂直墙方向的半宽是 d/2，否则是 w/2。
  const half = (((f.rot - wallAngle) % 180) + 180) % 180;
  const alongW = Math.min(half, 180 - half) < 45;
  const normalHalf = (alongW ? f.d : f.w) / 2;
  const tangentHalf = (alongW ? f.w : f.d) / 2;
  const rel: Point = [f.cx - w.a[0], f.cy - w.a[1]];
  const gap = Math.abs(dot(rel, n)) - normalHalf - w.thickness / 2;
  if (Math.abs(gap) > ATTACH_GAP) return false;
  const t = dot(rel, u);
  return t + tangentHalf > 0 && t - tangentHalf < L;
}

/**
 * before → after 中被整体平移的墙（长度、方向不变），把贴着它的家具沿墙的法向平移同样距离。
 * 只取法向分量：沿墙方向滑动墙不会带动家具；一件家具贴着多面被移动的墙时按第一面处理。
 */
export function followWallFurniture(before: Design, after: Design): Design {
  const shifts: { wall: Wall; delta: Point }[] = [];
  for (const old of before.walls) {
    const now = after.walls.find(w => w.id === old.id);
    if (!now) continue;
    const da: Point = [now.a[0] - old.a[0], now.a[1] - old.a[1]];
    const db: Point = [now.b[0] - old.b[0], now.b[1] - old.b[1]];
    if (Math.hypot(da[0] - db[0], da[1] - db[1]) > 0.01) continue;
    const L = length(old);
    if (L < 1) continue;
    const n: Point = [-(old.b[1] - old.a[1]) / L, (old.b[0] - old.a[0]) / L];
    const k = dot(da, n);
    if (Math.abs(k) < 0.01) continue;
    shifts.push({ wall: old, delta: [n[0] * k, n[1] * k] });
  }
  if (!shifts.length) return after;
  const original = new Map(before.furniture.map(f => [f.id, f]));
  let changed = false;
  const furniture = after.furniture.map(f => {
    const shift = shifts.find(s => touchesWall(original.get(f.id) ?? f, s.wall));
    if (!shift) return f;
    changed = true;
    const base = original.get(f.id) ?? f;
    return { ...f, cx: base.cx + shift.delta[0], cy: base.cy + shift.delta[1] };
  });
  return changed ? { ...after, furniture } : after;
}
