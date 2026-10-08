import { describe, it, expect } from "vitest";
import { blankDesign, referenceDesign } from "../data/templates";
import { calculateCosts, setPrice } from "./costs";
import { costBreakdown, selectionCost } from "./costBreakdown";
import { rect } from "./geometry";
import type { Design } from "./types";

/** 两间房共用材质、共墙上有门的空白户型。 */
function twoRoomDesign(): Design {
  const d = blankDesign();
  d.width = 6000;
  d.depth = 6000;
  d.rooms = [
    { id: "big", name: "客厅", rings: [rect(0, 0, 4000, 6000)], mat: "wood" },
    { id: "small", name: "卧室", rings: [rect(4000, 0, 2000, 6000)], mat: "wood" },
  ];
  d.walls.push({
    id: "shared",
    a: [4000, 0],
    b: [4000, 6000],
    thickness: 240,
    kind: "partition",
  });
  d.openings = [
    {
      id: "door",
      wallId: "shared",
      kind: "door",
      offset: 3000,
      width: 900,
      height: 2000,
    },
  ];
  return d;
}
describe("按房间成本分摊", () => {
  it("地面按面积占比分摊，各房间之和等于该材质采购小计", () => {
    const d = twoRoomDesign(),
      b = costBreakdown(d),
      row = calculateCosts(d).hard.find((r) => r.key === "wood")!,
      big = b.rooms.find((r) => r.roomId === "big")!,
      small = b.rooms.find((r) => r.roomId === "small")!;
    const floorOf = (room: typeof big) =>
      room.hard.find((p) => p.group === "floorPrices")!;
    expect(floorOf(big).subtotal + floorOf(small).subtotal).toBeCloseTo(
      row.subtotal,
      1,
    );
    // 24 m² : 12 m² = 2 : 1
    expect(floorOf(big).subtotal).toBeCloseTo(row.subtotal * (2 / 3), 0);
    expect(floorOf(small).subtotal).toBeCloseTo(row.subtotal * (1 / 3), 0);
  });
  it("共墙上的门在相邻两间平分，且房间门窗之和等于硬装门窗小计", () => {
    const d = setPrice(twoRoomDesign(), "openingPrices", "door", 1000),
      b = costBreakdown(d),
      total = calculateCosts(d).hard
        .filter((r) => r.group === "openingPrices")
        .reduce((s, r) => s + r.subtotal, 0);
    const doorOf = (id: string) =>
      b.rooms.find((r) => r.roomId === id)!.hard.find(
        (p) => p.group === "openingPrices",
      )!;
    expect(doorOf("big").subtotal).toBeCloseTo(total / 2, 1);
    expect(doorOf("small").subtotal).toBeCloseTo(total / 2, 1);
    expect(doorOf("big").subtotal + doorOf("small").subtotal).toBeCloseTo(
      total,
      1,
    );
  });
  it("不变量：各房间金额 + 公共项 = 全屋总额", () => {
    const d = setPrice(twoRoomDesign(), "wallPrices", "paint", 30);
    d.costSettings = {
      ...d.costSettings,
      constructionPrices: { build: 100 },
      labor: [{ id: "l1", name: "铺贴人工", amount: 2000 }],
    };
    const b = costBreakdown(d),
      c = calculateCosts(d);
    expect(b.roomTotal + b.sharedTotal).toBeCloseTo(c.total, 1);
    expect(b.total).toBeCloseTo(c.total, 1);
    expect(b.shared.some((p) => p.group === "labor")).toBe(true);
    expect(b.shared.find((p) => p.group === "labor")?.subtotal).toBe(2000);
  });
  it("房内家具归到该房间，房外家具进公共项", () => {
    const d = setPrice(
      twoRoomDesign(),
      "furniturePrices",
      "legacy:sofa:三人沙发:2400x900",
      2000,
    );
    d.furniture = [
      {
        id: "in",
        type: "sofa",
        name: "三人沙发",
        cx: 2000,
        cy: 3000,
        w: 2400,
        d: 900,
        rot: 0,
        color: "#c9d6df",
        catalogId: "legacy:sofa:三人沙发:2400x900",
      },
      {
        id: "out",
        type: "sofa",
        name: "三人沙发",
        cx: 9000,
        cy: 3000,
        w: 2400,
        d: 900,
        rot: 0,
        color: "#c9d6df",
        catalogId: "legacy:sofa:三人沙发:2400x900",
      },
    ];
    const b = costBreakdown(d);
    expect(
      b.rooms.find((r) => r.roomId === "big")!.softTotal,
    ).toBeCloseTo(2000, 2);
    expect(b.rooms.find((r) => r.roomId === "small")!.softTotal).toBe(0);
    expect(b.shared.find((p) => p.group === "furniturePrices")?.subtotal).toBe(
      2000,
    );
  });
  it("只贴一间房边界的窗全额归该房间，不做 0.5 分摊", () => {
    const d = setPrice(twoRoomDesign(), "openingPrices", "window", 800);
    d.walls.push({
      id: "north",
      a: [0, 0],
      b: [6000, 0],
      thickness: 240,
      kind: "exterior",
    });
    // 窗中心 x=2000，宽 1200，完全落在客厅（x 0–4000）一侧。
    d.openings.push({
      id: "win",
      wallId: "north",
      kind: "window",
      offset: 2000,
      width: 1200,
      height: 1500,
      sill: 900,
    });
    const b = costBreakdown(d),
      windowOf = (id: string) =>
        b.rooms
          .find((r) => r.roomId === id)!
          .hard.filter((p) => p.group === "openingPrices" && p.key === "window"),
      total = calculateCosts(d).hard.find(
        (r) => r.group === "openingPrices" && r.key === "window",
      )!.subtotal;
    expect(windowOf("big")).toHaveLength(1);
    expect(windowOf("big")[0].subtotal).toBeCloseTo(total, 1);
    expect(windowOf("big")[0].note).toBeUndefined();
    expect(windowOf("small")).toHaveLength(0);
  });
  it("空项目不报错，金额全部为 0", () => {
    const d = blankDesign();
    d.rooms = [];
    d.furniture = [];
    d.openings = [];
    const b = costBreakdown(d);
    expect(b.rooms).toEqual([]);
    expect(b.total).toBe(0);
    expect(b.roomTotal + b.sharedTotal).toBe(0);
    expect(selectionCost(d, { kind: "room", id: "missing" })).toBeNull();
  });
  it("未定价条目计数而不产生金额", () => {
    const d = twoRoomDesign();
    d.furniture = [
      {
        id: "f",
        type: "sofa",
        name: "三人沙发",
        cx: 2000,
        cy: 3000,
        w: 2400,
        d: 900,
        rot: 0,
        color: "#c9d6df",
      },
    ];
    const b = costBreakdown(d);
    expect(b.unpriced).toBeGreaterThan(0);
    expect(b.softTotal).toBe(0);
    expect(b.pricedCount).toBeLessThan(b.priceableCount);
  });
});
describe("真实户型的分解一致性", () => {
  for (const [name, make] of [
    ["参考户型", referenceDesign],
    ["空白户型", blankDesign],
  ] as const) {
    it(`${name}：各房间 + 公共项 = 总额，且分摊不产生负值`, () => {
      const d = make(),
        b = costBreakdown(d),
        parts = [
          ...b.rooms.flatMap((r) => [...r.hard, ...r.soft]),
          ...b.shared,
        ];
      expect(b.roomTotal + b.sharedTotal).toBeCloseTo(b.total, 1);
      expect(b.hardTotal + b.softTotal).toBeCloseTo(b.total, 1);
      expect(parts.every((p) => p.subtotal >= 0)).toBe(true);
      expect(parts.every((p) => p.quantity >= 0)).toBe(true);
    });
  }
  it("参考户型里每间房的家具都落在自己的房间内", () => {
    const d = referenceDesign(),
      b = costBreakdown(d),
      housed = b.rooms.reduce(
        (s, r) => s + r.soft.reduce((n, p) => n + p.quantity, 0),
        0,
      ),
      outside = b.shared
        .filter((p) => p.group === "furniturePrices")
        .reduce((n, p) => n + p.quantity, 0);
    expect(housed + outside).toBe(d.furniture.length);
  });
});
describe("选中对象的成本", () => {
  it("房间返回本间金额，家具返回单价", () => {
    const d = setPrice(twoRoomDesign(), "floorPrices", "wood", 100);
    expect(selectionCost(d, { kind: "room", id: "big" })?.amount).toBeCloseTo(
      costBreakdown(d).rooms.find((r) => r.roomId === "big")!.total,
      1,
    );
    d.furniture = [
      {
        id: "f",
        type: "sofa",
        name: "三人沙发",
        cx: 2000,
        cy: 3000,
        w: 2400,
        d: 900,
        rot: 0,
        color: "#c9d6df",
        catalogId: "legacy:sofa:三人沙发:2400x900",
      },
    ];
    expect(selectionCost(d, { kind: "furniture", id: "f" })?.amount).toBeNull();
    expect(
      selectionCost(setPrice(d, "furniturePrices", "legacy:sofa:三人沙发:2400x900", 1500), {
        kind: "furniture",
        id: "f",
      })?.amount,
    ).toBe(1500);
  });
  it("墙体与门窗按面积计价，参考墙体不计新建，空选中返回 null", () => {
    const d = twoRoomDesign(),
      wall = setPrice(d, "constructionPrices", "build", 100);
    expect(selectionCost(wall, { kind: "wall", id: "shared" })?.amount).toBeCloseTo(
      (6 * 2.8) * 100,
      0,
    );
    expect(selectionCost(d, { kind: "wall", id: "outer-0" })?.amount).toBe(0);
    expect(selectionCost(d, { kind: "opening", id: "door" })?.amount).toBeNull();
    expect(selectionCost(d, null)).toBeNull();
  });
});
