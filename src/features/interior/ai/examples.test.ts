import { describe, expect, it } from "vitest";
import { buildAiCatalog } from "./catalog";
import { planExamples, roomExamples, roomKindOf } from "./examples";
import { planToDesign } from "./apply";
import { sanitizePlan } from "./sanitize";
import { AI_EXAMPLE_PLANS } from "./examplePlans";
import type { AiCatalog, AiPlacedItem } from "./types";

const footprint = (p: AiPlacedItem, e: { w: number; d: number }, W: number, D: number) => {
  const h = p.back === "up" || p.back === "down";
  const along = p.along ?? (h ? W : D) / 2, gap = p.gap ?? 0;
  const [w, d] = h ? [e.w, e.d] : [e.d, e.w];
  const cx = h ? along : p.back === "left" ? gap + e.d / 2 : W - gap - e.d / 2;
  const cy = !h ? along : p.back === "up" ? gap + e.d / 2 : D - gap - e.d / 2;
  return [cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2];
};

const entryOf = (catalog: AiCatalog, code: string) => catalog.entries.find((e) => e.code === code)!;

describe("AI 范例（范例户型序列化）", () => {
  const catalog = buildAiCatalog();
  const examples = planExamples(catalog);

  it("每套范例户型一条整户范例", () => {
    expect(examples).toHaveLength(AI_EXAMPLE_PLANS.length);
    expect(examples).toHaveLength(5);
  });

  for (const example of examples) {
    const { output } = example;
    it(`${output.summary}：能按 AI 落地流程还原成方案`, () => {
      const design = planToDesign(sanitizePlan(output, { catalog }), catalog);
      expect(design.rooms).toHaveLength(output.rooms.length);
      expect(design.furniture.length).toBeGreaterThanOrEqual(15);
      expect(JSON.stringify(output)).not.toContain("hinge");
    });

    it(`${output.summary}：家具代号都在目录里，占地不越界`, () => {
      for (const group of output.furniture) {
        const room = output.rooms.find((r) => r.id === group.room)!;
        expect(room).toBeDefined();
        // 家具相对净空矩形：中心线矩形去掉内墙半厚。
        const [x1, y1, x2, y2] = room.box;
        const W = x2 - x1 - (x1 > 0 ? 60 : 0) - (x2 < output.width ? 60 : 0);
        const D = y2 - y1 - (y1 > 0 ? 60 : 0) - (y2 < output.depth ? 60 : 0);
        for (const item of group.items) {
          const entry = entryOf(catalog, item.code);
          expect(entry, item.code).toBeDefined();
          expect(Object.keys(item).every((k) => ["code", "back", "along", "gap"].includes(k))).toBe(true);
          const [a, b, c, d] = footprint(item, entry, W, D);
          expect(a >= -30 && b >= -30 && c <= W + 30 && d <= D + 30, `${room.name} ${entry.name} 越界`).toBe(true);
        }
      }
    });

    it(`${output.summary}：房间轮廓贴外墙的边落在外轮廓上，内墙侧在中心线上`, () => {
      const wallLines = new Set(output.walls.map((w) => `${w.dir}:${w.at}`));
      for (const { box: [x1, y1, x2, y2], name } of output.rooms) {
        for (const [dir, at, outer] of [["v", x1, 0], ["h", y1, 0], ["v", x2, output.width], ["h", y2, output.depth]] as const)
          expect(at === outer || wallLines.has(`${dir}:${at}`), `${name} 的边 ${dir}=${at}`).toBe(true);
      }
    });
  }

  it("房间范例按类别挑选", () => {
    expect(roomKindOf("主卧")).toBe("bedroom");
    expect(roomKindOf("主卫浴")).toBe("bathroom");
    expect(roomKindOf("客餐厅")).toBe("living");
    const bedroom = roomExamples(catalog, { name: "主卧室", zone: [0, 0, 3600, 3500] });
    expect(bedroom.length).toBeGreaterThan(0);
    expect(bedroom.length).toBeLessThanOrEqual(3);
    expect(bedroom.every((e) => /卧/.test(e.room.name))).toBe(true);
    expect(bedroom[0].room.openings.length).toBeGreaterThan(0);
    expect(roomExamples(catalog, { name: "厨房", zone: [0, 0, 2500, 3200] }).every((e) => e.room.name === "厨房")).toBe(true);
  });

  it("没有同类模板房间时不给范例", () => {
    expect(roomExamples(catalog, { name: "储藏间", zone: [0, 0, 2000, 2000] })).toEqual([]);
  });

  it("目录里缺某类家具时跳过该件而不是报错", () => {
    const partial: AiCatalog = { ...catalog, entries: catalog.entries.filter((e) => e.type !== "bed") };
    const [first] = planExamples(partial);
    const codes = first.output.furniture.flatMap((g) => g.items.map((i) => entryOf(catalog, i.code).type));
    expect(codes).not.toContain("bed");
    expect(codes.length).toBeGreaterThan(0);
  });
});
