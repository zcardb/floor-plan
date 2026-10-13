import { describe, expect, it } from "vitest";
import { blankDesign, referenceDesign } from "@/lib/floor-plan/templates";
import { calculateCosts, furnitureKey, setPrice } from "@/lib/floor-plan/costs";
import { costBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { effectiveCostDesign } from "@/lib/floor-plan/cost-defaults";
import { decorStyleById } from "@/lib/floor-plan/decor-styles";
import { createExportDocument } from "@/lib/drawing/drawing-document";
import { rect } from "@/lib/floor-plan/geometry";
import { houseTypeLabel } from "../model/house-type";
import { problemOf } from "@/lib/floor-plan/layout-rules";
import { yuan } from "@/lib/floor-plan/money";
import { REPORT_CONTENTS, REPORT_SECTIONS, buildReport, infoItems, planCaption } from "../model/report";
import type { Design, Furniture } from "@/lib/floor-plan/types";

const DATE = new Date(2026, 9, 12, 18, 0);
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const last = <T,>(list: T[]) => list[list.length - 1];
const piece = (id: string, extra: Partial<Furniture> = {}): Furniture => ({
  id, type: "sofa", name: "三人沙发", cx: 2000, cy: 3000, w: 2100, d: 900, rot: 0, color: "#b7c4b0", ...extra,
});

/** 两间房共墙开门：客厅 4 × 6 m、卧室 2 × 6 m，一张定价沙发、一个未定价衣柜，外加人工与房外家具。 */
function twoRoomDesign(): Design {
  const d = blankDesign();
  d.rooms = [
    { id: "big", name: "客厅", rings: [rect(0, 0, 4000, 6000)], mat: "wood" },
    { id: "small", name: "卧室", rings: [rect(4000, 0, 2000, 6000)], mat: "wood" },
  ];
  d.walls.push({ id: "shared", a: [4000, 0], b: [4000, 6000], thickness: 240, kind: "partition" });
  d.openings = [{ id: "door", wallId: "shared", kind: "door", offset: 3000, width: 900, height: 2000 }];
  d.furniture = [
    piece("sofa-1"),
    piece("sofa-2", { cx: 2000, cy: 5000 }),
    piece("wardrobe", { type: "wardrobe", name: "衣柜", cx: 5000, cy: 3000, w: 1200, d: 600 }),
    piece("outside", { name: "边几", cx: 9000, cy: 9000, w: 500, d: 500 }),
  ];
  let next = setPrice(d, "furniturePrices", furnitureKey(d.furniture[0]), 3200);
  next = setPrice(next, "furniturePrices", furnitureKey(d.furniture[3]), 400);
  next = setPrice(next, "wallPrices", "paint", 35);
  return { ...next, costSettings: { ...next.costSettings, labor: [{ id: "l1", name: "水电改造", amount: 6000 }] } };
}

describe("方案报告数据", () => {
  it("分节固定齐全（首页是关键信息与平面图），且是纯数据（JSON 往返不变）", () => {
    const model = buildReport(twoRoomDesign(), undefined, { name: "我的家", date: DATE });
    expect(Object.keys(model)).toEqual(Object.keys(REPORT_SECTIONS));
    expect(Object.values(REPORT_SECTIONS)).toEqual(["关键信息", "平面图", "预算构成", "关键数字", "逐间清单", "布局体检", "家具清单"]);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    expect(model.info).toEqual({
      name: "我的家",
      date: "2026-10-12",
      houseType: { bedrooms: 1, halls: 1, bathrooms: 0 },
      netArea: 36,
      grossArea: expect.any(Number),
      style: decorStyleById(undefined).name,
    });
    // 建筑面积把墙体算进去，必然大于套内净面积（不含公摊，不是房产证上的口径，见 grossArea.ts）。
    expect(model.info.grossArea).toBeGreaterThan(model.info.netArea);
  });

  it("目录按版面顺序，第一条是首页的平面图与关键信息", () => {
    expect(REPORT_CONTENTS[0]).toEqual(["plan", "平面图与关键信息"]);
    expect(REPORT_CONTENTS.slice(1).map(([section]) => section)).toEqual(["budget", "figures", "rooms", "layout", "furniture"]);
    // 除首页那条合并项外，目录标题就是分节标题，改一处不会两边不一致。
    for (const [section, title] of REPORT_CONTENTS.slice(1)) expect(title).toBe(REPORT_SECTIONS[section]);
  });

  it("关键信息带：户型、面积、房间数、风格与总价；有未定价条目时在总价下注明", () => {
    const model = buildReport(twoRoomDesign(), undefined, { name: "我的家", date: DATE });
    const items = infoItems(model);
    expect(items.map(([label]) => label)).toEqual(["户型", "套内 / 建筑面积", "房间数", "装修风格", "预算总价"]);
    expect(items.map(([, value]) => value)).toEqual([
      houseTypeLabel(model.info.houseType),
      `${model.info.netArea.toFixed(2)} / ${model.info.grossArea.toFixed(2)} m²`,
      "2 间",
      model.info.style,
      yuan(model.figures.total),
    ]);
    expect(items[0][1]).toBe("一室一厅零卫");
    expect(model.figures.unpriced).toBeGreaterThan(0);
    expect(last(items)[2]).toBe(`另有 ${model.figures.unpriced} 项未定价`);
    // 只有总价带补充说明；全部定价后连这条也不写。
    expect(items.slice(0, -1).every(([, , note]) => note === undefined)).toBe(true);
    expect(last(infoItems({ info: model.info, figures: { ...model.figures, unpriced: 0 } }))[2]).toBeUndefined();
  });

  it("平面图与图纸导出同一份；没有有效墙体时为 null（首页改写说明，不抛错）", () => {
    const d = twoRoomDesign(), model = buildReport(d);
    expect(model.plan).toEqual(createExportDocument(d));
    expect(planCaption(100)).toBe("比例 1:100（A4） · 尺寸单位 m · 图层可在阅读器中开关");
    expect(buildReport({ ...d, walls: [] }).plan).toBeNull();
    expect(buildReport({ ...blankDesign(), walls: [], rooms: [] }).plan).toBeNull();
  });

  it("关键数字的总价、硬装、软装就是成本分摊的结果", () => {
    for (const d of [twoRoomDesign(), referenceDesign(), setPrice(referenceDesign(), "floorPrices", "wood", 260)]) {
      const model = buildReport(d), b = costBreakdown(d);
      expect(model.figures.total).toBe(b.total);
      expect(model.figures.hard).toBe(b.hardTotal);
      expect(model.figures.soft).toBe(b.softTotal);
      expect(model.figures.total).toBeCloseTo(calculateCosts(d).total, 1);
      expect(model.figures.unpriced).toBe(b.unpriced);
      expect(model.figures.perSquareMeter).toBeCloseTo(b.total / model.info.netArea, 1);
    }
  });

  it("逐间合计与公共项之和等于总价，硬装 / 软装两列各自也对得上", () => {
    for (const d of [twoRoomDesign(), referenceDesign()]) {
      const { figures, rooms } = buildReport(d);
      expect(sum(rooms.lines.map((r) => r.total)) + rooms.shared.total).toBeCloseTo(figures.total, 1);
      expect(sum(rooms.lines.map((r) => r.hard)) + rooms.shared.hard).toBeCloseTo(figures.hard, 1);
      expect(sum(rooms.lines.map((r) => r.soft)) + rooms.shared.soft).toBeCloseTo(figures.soft, 1);
      for (const r of rooms.lines) expect(r.hard + r.soft).toBeCloseTo(r.total, 1);
    }
    // 房外边几（400）与人工（6000）都留在公共项。
    const shared = buildReport(twoRoomDesign()).rooms.shared;
    expect(shared.soft).toBeCloseTo(400, 1);
    expect(shared.total).toBeGreaterThanOrEqual(6400);
  });

  it("房间数、家具件数与方案一致；家具清单的件数加起来也是家具件数", () => {
    for (const d of [twoRoomDesign(), referenceDesign()]) {
      const model = buildReport(d);
      expect(model.figures.rooms).toBe(d.rooms.length);
      expect(model.rooms.lines.map((r) => r.id)).toEqual(d.rooms.map((r) => r.id));
      expect(model.figures.furniture).toBe(d.furniture.length);
      expect(model.furniture.quantity).toBe(d.furniture.length);
      expect(sum(model.furniture.lines.map((l) => l.quantity))).toBe(d.furniture.length);
    }
  });

  it("预算构成按成本科目归并：金额之和等于总价，占比合计 100%，口径与成本侧栏一致", () => {
    const d = twoRoomDesign(), { budget, figures } = buildReport(d);
    expect(budget.total).toBe(figures.total);
    expect(sum(budget.lines.map((l) => l.amount))).toBeCloseTo(figures.total, 1);
    expect(sum(budget.lines.map((l) => l.share))).toBeCloseTo(1, 3);
    // 空白户型里画的隔墙按「新建隔墙」计入拆改与新建（未定价）。
    expect(budget.lines.map((l) => l.label)).toEqual(["地面", "墙面", "门窗", "拆改与新建", "人工", "软装"]);
    expect(budget.lines.find((l) => l.id === "labor")).toMatchObject({ amount: 6000, kind: "hard", basis: "独立总价条目" });
    expect(budget.lines.find((l) => l.id === "furniturePrices")).toMatchObject({ kind: "soft", unpriced: 1, amount: 2 * 3200 + 400 });
    expect(budget.lines.find((l) => l.id === "openingPrices")?.unpriced).toBe(1);
  });

  it("家具清单按名称 + 型号归并，未定价的单价为空、排在最后（单价为 0 的仍算已定价）", () => {
    const gift = piece("gift", { type: "plant", name: "绿植", cx: 5000, cy: 1000, w: 500, d: 500 });
    const d = setPrice(twoRoomDesign(), "furniturePrices", furnitureKey(gift), 0);
    d.furniture.push(piece("sofa-wide", { cx: 1000, cy: 1000, w: 2400 }), gift);
    const lines = buildReport(d).furniture.lines;
    expect(lines[0]).toEqual({ name: "三人沙发", model: "2.10 × 0.90 m", quantity: 2, price: 3200, subtotal: 6400, hard: false });
    expect(lines.find((l) => l.model === "2.40 × 0.90 m")).toMatchObject({ name: "三人沙发", quantity: 1, price: 3200 });
    expect(lines.map((l) => l.name).slice(-2)).toEqual(["绿植", "衣柜"]);
    expect(last(lines)).toMatchObject({ name: "衣柜", price: null, subtotal: 0 });
    expect(buildReport(d).furniture.total).toBe(3 * 3200 + 400);
  });

  it("布局体检逐条列出房间、家具与中文问题描述", () => {
    const d = blankDesign();
    d.furniture = [
      piece("cabinet", { type: "wardrobe", name: "衣柜", cx: 3000, cy: 3000, w: 1200, d: 600 }),
      piece("ok", { type: "rug", name: "地毯", cx: 3000, cy: 4500, w: 1600, d: 1000 }),
    ];
    const { layout } = buildReport(d);
    expect(layout.checked).toBe(2);
    expect(layout.issues).toHaveLength(1);
    const [issue] = layout.issues;
    expect(issue).toMatchObject({ room: d.rooms[0].name, furniture: "衣柜", furnitureId: "cabinet", kind: "backing" });
    expect(issue.problem).toBe(problemOf({ kind: "backing", other: "none" }));
    expect(issue.problem).toContain("没有实墙");
  });

  it("账号默认价与成本侧栏同一套合并规则", () => {
    const d = twoRoomDesign(), defaults = { furniturePrices: { [furnitureKey(d.furniture[2])]: 5000 } };
    const model = buildReport(d, defaults);
    expect(model.figures.total).toBe(costBreakdown(effectiveCostDesign(d, defaults)).total);
    expect(model.figures.total).toBeCloseTo(buildReport(d).figures.total + 5000, 1);
    expect(model.furniture.lines.find((l) => l.name === "衣柜")).toMatchObject({ price: 5000, subtotal: 5000 });
  });

  it("装修风格写风格名；项目名为空时写「未命名方案」", () => {
    const model = buildReport({ ...twoRoomDesign(), styleId: "cream" }, undefined, { name: "  ", date: DATE });
    expect(model.info.style).toBe(decorStyleById("cream").name);
    // 确认取到的是该风格本身，而不是未知 id 回落的默认风格。
    expect(model.info.style).not.toBe(decorStyleById(undefined).name);
    expect(model.info.name).toBe("未命名方案");
  });

  it("边界：没有家具、没有定价、没有房间、没有墙体都不抛错", () => {
    const empty = blankDesign();
    empty.furniture = [];
    const model = buildReport(empty);
    expect(model.furniture).toEqual({ lines: [], quantity: 0, total: 0 });
    expect(model.layout).toEqual({ issues: [], checked: 0 });
    expect(model.figures.total).toBe(costBreakdown(empty).total);
    const unpriced = buildReport({ ...twoRoomDesign(), costSettings: {} });
    expect(unpriced.figures.unpriced).toBeGreaterThan(0);
    expect(unpriced.furniture.lines.every((l) => l.price === null && l.subtotal === 0)).toBe(true);
    const roomless = buildReport({ ...blankDesign(), rooms: [], walls: [] });
    expect(roomless.info.netArea).toBe(0);
    expect(roomless.info.grossArea).toBe(0);
    expect(roomless.info.houseType).toEqual({ bedrooms: 0, halls: 0, bathrooms: 0 });
    expect(roomless.figures.perSquareMeter).toBeNull();
    expect(roomless.rooms.lines).toEqual([]);
    expect(roomless.plan).toBeNull();
    // 关键信息带仍排得出来：识别不出户型、算不出建筑面积时写占位符。
    expect(infoItems(roomless).map(([, value]) => value).slice(0, 3)).toEqual(["—", "0.00 / — m²", "0 间"]);
  });
});
