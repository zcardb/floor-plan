import { length, norm, rebuildRooms } from "./geometry";
import type { Design, Selection } from "./types";
export function editSelection(
  d: Design,
  s: Selection,
  values: Record<string, number>,
): Design {
  if (!s) return d;
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
    if (!w || d.template !== "blank" || w.kind !== "partition")
      throw new Error("此墙体的结构尺寸已锁定");
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
    return rebuildRooms({
      ...d,
      walls: d.walls.map((g) => (g.id === s.id ? next : g)),
    });
  }
  if (s.kind === "opening") {
    const o = d.openings.find((o) => o.id === s.id),
      w = d.walls.find((w) => w.id === o?.wallId);
    if (!o || !w) return d;
    const n = { ...o, ...values };
    if (
      n.offset - n.width / 2 < 0 ||
      n.offset + n.width / 2 > length(w) ||
      d.openings.some(
        (g) =>
          g.id !== n.id &&
          g.wallId === n.wallId &&
          Math.abs(g.offset - n.offset) < (g.width + n.width) / 2,
      )
    )
      throw new Error("开口超出墙段或与其它门窗重叠");
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
