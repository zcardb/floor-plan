import { wallPoly } from "./geometry";
import type { Design, Point, Selection } from "./types";
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function selectionPoints(d: Design, s: Selection): Point[] {
  if (!s) return [];
  if (s.kind === "furniture") {
    const f = d.furniture.find((f) => f.id === s.id);
    if (!f) return [];
    const a = (f.rot * Math.PI) / 180;
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => [
      f.cx + ((x * f.w) / 2) * Math.cos(a) - ((y * f.d) / 2) * Math.sin(a),
      f.cy + ((x * f.w) / 2) * Math.sin(a) + ((y * f.d) / 2) * Math.cos(a),
    ]);
  }
  if (s.kind === "room")
    return d.rooms.find((r) => r.id === s.id)?.rings[0] || [];
  if (s.kind === "wall") {
    const w = d.walls.find((w) => w.id === s.id);
    return w ? wallPoly(w) : [];
  }
  const o = d.openings.find((o) => o.id === s.id),
    w = d.walls.find((w) => w.id === o?.wallId);
  if (!o || !w) return [];
  return wallPoly(w);
}
export function placeEditor(
  object: ScreenRect | null,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  obstacles: ScreenRect[] = [],
) {
  if (
    !object ||
    object.right < 0 ||
    object.bottom < 0 ||
    object.left > viewport.width ||
    object.top > viewport.height
  )
    return null;
  const gap = 12,
    pad = 10,
    maxX = Math.max(pad, viewport.width - size.width - pad),
    maxY = Math.max(pad, viewport.height - size.height - pad);
  const candidates = [
    [object.right + gap, object.bottom + gap],
    [object.left, object.bottom + gap],
    [object.left, object.top - size.height - gap],
    [object.left - size.width - gap, object.top],
    [object.right + gap, object.top],
  ];
  const clamp = (v: number, max: number) => Math.max(pad, Math.min(max, v));
  const overlap = (a: ScreenRect, b: ScreenRect) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return candidates
    .map(([x, y], index) => {
      const left = clamp(x, maxX),
        top = clamp(y, maxY),
        r = { left, top, right: left + size.width, bottom: top + size.height };
      return {
        x: left,
        y: top,
        score:
          obstacles.reduce((s, o) => s + overlap(r, o) * 10, 0) +
          overlap(r, object) +
          Math.abs(x - left) +
          Math.abs(y - top) +
          index * 0.01,
      };
    })
    .sort((a, b) => a.score - b.score)[0];
}
