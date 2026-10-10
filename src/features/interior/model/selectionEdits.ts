import { length, norm } from "./geometry";
import { BEARING_WALL_LOCKED, canResizeWall } from './wallPolicy';
import { syncRooms } from './roomFollow';
import { placementShift, wallPlacement } from './wallPlacement';
import type { Design, Selection } from "./types";

/**
 * 把「沿墙位置」输入（gapA / gapB：对象两端到所在墙段第 1 / 第 2 端的净距）换算成沿墙位移后的 offset 或 cx / cy。
 */
function withPlacement(d: Design, s: Selection, values: { gapA?: number; gapB?: number }) {
  const placement = wallPlacement(d, s);
  if (!placement) throw new Error('该对象当前没有贴着的墙段');
  for (const key of ['gapA', 'gapB'] as const)
    if (values[key] !== undefined && (!Number.isFinite(values[key]) || values[key]! < -0.01 || values[key]! > 100000))
      throw new Error('距墙端的净距须在 0–100 m 之间');
  const shift = placementShift(placement, { gap0: values.gapA, gap1: values.gapB });
  const wall = placement.wall, L = length(wall);
  const ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
  if (s?.kind === 'opening') return { values: { offset: d.openings.find(o => o.id === s.id)!.offset + shift } };
  const f = d.furniture.find(f => f.id === s!.id)!;
  return { values: { cx: f.cx + ux * shift, cy: f.cy + uy * shift } };
}

export function editSelection(
  d: Design,
  s: Selection,
  raw: Record<string, number>,
): Design {
  if (!s) return d;
  // 净距输入在其他尺寸生效之后再换算，保证同时改宽度与净距时两者都准确。
  if (raw.gapA !== undefined || raw.gapB !== undefined) {
    const { gapA, gapB, ...rest } = raw;
    const sized = Object.keys(rest).length ? editSelection(d, s, rest) : d;
    return editSelection(sized, s, withPlacement(sized, s, { gapA, gapB }).values);
  }
  const values = raw;
  for (const [k, v] of Object.entries(values)) {
    const min = ["w", "d"].includes(k)
        ? 50
        : k === "thickness"
          ? 50
          : k === "length"
            ? 100
            : k === "width"
              ? 100
              : k === "height"
                ? 100
                : k === "offset" || k === "sill"
                  ? 0
                  : -100000,
      max = ["w", "d"].includes(k)
        ? 20000
        : k === "thickness"
          ? 1000
          : k === "length"
            ? 50000
            : k === "height"
              ? 8000
              : 100000;
    if (!Number.isFinite(v) || v < min || v > max)
      throw new Error("请输入允许范围内的有效尺寸");
  }
  if (s.kind === "furniture")
    return {
      ...d,
      furniture: d.furniture.map((f) =>
        f.id === s.id
          ? {
              ...f,
              ...values,
              rot: values.rot === undefined ? f.rot : norm(values.rot),
            }
          : f,
      ),
    };
  if (s.kind === "wall") {
    const w = d.walls.find((w) => w.id === s.id);
    if (!w) throw new Error("墙体不存在，请重新选择");
    if (!canResizeWall(d, w)) throw new Error(BEARING_WALL_LOCKED);
    const L = length(w),
      next = {
        ...w,
        thickness: values.thickness ?? w.thickness,
        b:
          values.length === undefined
            ? w.b
            : ([
                w.a[0] + ((w.b[0] - w.a[0]) * values.length) / L,
                w.a[1] + ((w.b[1] - w.a[1]) * values.length) / L,
              ] as [number, number]),
      };
    if (
      d.openings.some(
        (o) => o.wallId === w.id && o.offset + o.width / 2 > length(next),
      )
    )
      throw new Error("墙体缩短后无法容纳门窗");
    return syncRooms(d, {
      ...d,
      walls: d.walls.map((g) => (g.id === s.id ? next : g)),
    });
  }
  if (s.kind === "opening") {
    const o = d.openings.find((o) => o.id === s.id),
      w = d.walls.find((w) => w.id === o?.wallId);
    if (!o || !w) return d;
    const n = { ...o, ...values }, L = length(w);
    if (n.width > L) throw new Error("门窗宽度超过所在墙段长度");
    // 只改宽度时以中心为基准；碰到墙端则整体平移，保证宽度改动立即生效。
    if (values.width !== undefined && values.offset === undefined)
      n.offset = Math.min(Math.max(n.offset, n.width / 2), L - n.width / 2);
    if (n.offset - n.width / 2 < 0 || n.offset + n.width / 2 > L)
      throw new Error("开口超出墙段范围");
    if (
      d.openings.some(
        (g) =>
          g.id !== n.id &&
          g.wallId === n.wallId &&
          Math.abs(g.offset - n.offset) < (g.width + n.width) / 2,
      )
    )
      throw new Error("开口与同墙其它门窗重叠");
    if (
      (n.height ?? (n.kind === "door" ? 2100 : 1600)) +
        (n.kind === "window" ? (n.sill ?? 800) : 0) >
      d.height
    )
      throw new Error("开口顶部不可超过层高");
    return { ...d, openings: d.openings.map((g) => (g.id === s.id ? n : g)) };
  }
  return d;
}
