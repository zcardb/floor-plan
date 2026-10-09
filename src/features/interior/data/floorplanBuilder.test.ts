import { describe, expect, it } from "vitest";
import { buildStructure, outlineEdgeKey, type PlanSpec } from "./floorplanBuilder";
import type { Wall } from "../model/types";

const base: PlanSpec = { id: "t", width: 12000, depth: 10000, walls: [], openings: [], rooms: [], furniture: [] };
const ends = (w: Wall) => [w.a, w.b].map((p) => p.join(",")).sort().join(" ");

describe("外墙生成：矩形与不规则外轮廓", () => {
  it("不传 outline 时仍是 top / right / bottom / left 四面墙", () => {
    const { walls } = buildStructure(base);
    expect(walls.map((w) => w.id)).toEqual(["top", "right", "bottom", "left"]);
  });

  it("矩形 outline 与不传 outline 生成的外墙几何完全一致（凸角各伸出一个墙厚）", () => {
    const rect = buildStructure(base).walls.map(ends);
    const fromOutline = buildStructure({ ...base, outline: [[0, 0], [12000, 0], [12000, 10000], [0, 10000]] }).walls;
    expect(fromOutline.map((w) => w.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(fromOutline.map(ends)).toEqual(rect);
  });

  it("逆时针给出的轮廓同样向外偏移", () => {
    const ccw = buildStructure({ ...base, outline: [[0, 0], [0, 10000], [12000, 10000], [12000, 0]] }).walls;
    expect(ccw.map(ends).sort()).toEqual(buildStructure(base).walls.map(ends).sort());
  });

  it("L 形：凹角处外墙停在室内转角，不侵入室内；门窗按世界坐标落在 ek 上", () => {
    const t = 240;
    const { walls, openings } = buildStructure({
      ...base,
      outline: [[0, 0], [8000, 0], [8000, 3000], [12000, 3000], [12000, 10000], [0, 10000]],
      openings: [{ wall: outlineEdgeKey(1), kind: "window", at: 1500, width: 1200 }],
    });
    // e2：x = 8000 + t/2 的竖墙，上端凸角伸出 t，下端凹角停在 y = 3000。
    const e2 = walls.filter((w) => w.id.startsWith("e2") || w.id.includes("-e2-"));
    expect(e2.every((w) => w.a[0] === 8000 + t / 2 && w.b[0] === 8000 + t / 2)).toBe(true);
    expect(Math.min(...e2.flatMap((w) => [w.a[1], w.b[1]]))).toBe(-t);
    expect(Math.max(...e2.flatMap((w) => [w.a[1], w.b[1]]))).toBe(3000);
    // e3：y = 3000 - t/2 的横墙，左端凹角停在 x = 8000，右端凸角伸出 t。
    const e3 = walls.find((w) => w.id === "e3")!;
    expect(e3.a).toEqual([8000, 3000 - t / 2]);
    expect(e3.b).toEqual([12000 + t, 3000 - t / 2]);
    expect(walls.filter((w) => w.kind === "exterior")).toHaveLength(8); // 6 条边，e2 被窗切成 3 段
    expect(openings).toHaveLength(1);
  });
});
