import { describe, expect, it } from "vitest";
import { blankDesign, referenceDesign } from "../data/templates";
import { area, bbox, rect, wallPoly } from "./geometry";
import { grossArea } from "./grossArea";
import type { Design } from "./types";

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const netArea = (d: Design) => sum(d.rooms.map(area));
/** 全部墙体的外接矩形面积（m²）：矩形户型的建筑面积就是它。 */
function wallBoxArea(d: Design) {
  const b = bbox(d.walls.flatMap((w) => wallPoly(w)));
  return ((b.x2 - b.x) * (b.y2 - b.y)) / 1e6;
}

describe("建筑面积", () => {
  it("矩形户型 = 外墙外皮围合的矩形，比套内净面积多出墙体所占的部分", () => {
    const d = blankDesign({ width: 6000, depth: 4000 });
    expect(grossArea(d)).toBeCloseTo(wallBoxArea(d), 6);
    expect(grossArea(d)).toBeGreaterThan(netArea(d));
    expect(netArea(d)).toBeCloseTo(24, 6);
  });

  it("内隔墙不重复计：加一道隔墙，建筑面积不变", () => {
    const d = blankDesign();
    const split: Design = { ...d, walls: [...d.walls, { id: "mid", a: [3000, 0], b: [3000, 6000], thickness: 120, kind: "partition" }] };
    expect(grossArea(split)).toBeCloseTo(grossArea(d), 6);
  });

  it("非矩形户型按实际外轮廓计，不是外接矩形；围在里面的房间和墙都算", () => {
    const d = referenceDesign(), gross = grossArea(d);
    expect(gross).toBeGreaterThan(netArea(d));
    expect(gross).toBeLessThan(wallBoxArea(d));
    // 墙体外轮廓之内除了房间就是墙：墙体占比在常见住宅的范围里（一到两成）。
    expect((gross - netArea(d)) / gross).toBeGreaterThan(0.08);
    expect((gross - netArea(d)) / gross).toBeLessThan(0.25);
  });

  it("已拆除的墙不计；没有墙体时按房间轮廓计，什么都没有时为 0", () => {
    const d = blankDesign();
    const roomsOnly = { ...d, walls: [] };
    expect(grossArea(roomsOnly)).toBeCloseTo(netArea(d), 6);
    expect(grossArea({ ...d, demolished: d.walls.map((w) => w.id) })).toBeCloseTo(netArea(d), 6);
    // 两间相邻的房间合起来算，不重叠也不留缝。
    const rooms = [
      { id: "a", name: "客厅", rings: [rect(0, 0, 4000, 6000)], mat: "wood" },
      { id: "b", name: "卧室", rings: [rect(4000, 0, 2000, 6000)], mat: "wood" },
    ];
    expect(grossArea({ walls: [], rooms, demolished: [] })).toBeCloseTo(36, 6);
    expect(grossArea({ walls: [], rooms: [], demolished: [] })).toBe(0);
  });
});
