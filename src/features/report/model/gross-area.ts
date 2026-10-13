import polygonClipping from "polygon-clipping";
import { length, ringArea } from "@/lib/floor-plan/geometry";
import { connectedWallPoly } from "@/lib/floor-plan/wall-connections";
import type { Design, Point } from "@/lib/floor-plan/types";

/**
 * 建筑面积（m²）：墙体外轮廓围合的范围——全部房间加上墙体所占的面积，围在里面的空洞一并计入。
 *
 * 这是按图纸能算出的口径，不含公摊，所以与房产证上的建筑面积不是一回事；套内净面积见 roomMetrics。
 * 已拆除的墙不计。没有墙体也没有房间时为 0。
 */
export function grossArea(d: Pick<Design, "walls" | "rooms" | "demolished">): number {
  const walls = d.walls.filter(
    (w) => !d.demolished.includes(w.id) && [...w.a, ...w.b, w.thickness].every(Number.isFinite) && w.thickness > 0 && length(w) > 0.01,
  );
  const shapes = [...walls.map((w) => connectedWallPoly(w, walls, d.demolished)), ...d.rooms.map((r) => r.rings[0])]
    .filter((ring) => ring?.length >= 3)
    .map((ring): polygonClipping.Polygon => [ring]);
  if (!shapes.length) return 0;
  // 合并后每块只取外环：外环以内的墙、房间与空洞都算建筑面积。
  const merged = polygonClipping.union(shapes[0], ...shapes.slice(1));
  return merged.reduce((sum, polygon) => sum + ringArea(polygon[0] as Point[]), 0) / 1e6;
}
