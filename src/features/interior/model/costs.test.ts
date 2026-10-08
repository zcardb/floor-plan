import { describe, it, expect } from "vitest";
import { blankDesign, referenceDesign } from "../data/templates";
import {
  calculateCosts,
  furnitureKey,
  normalizeFurniture,
  setPrice,
  wallSurfaceArea,
} from "./costs";
import { rect } from "./geometry";
import { validateDesign } from "./validation";
describe("项目成本联动", () => {
  it("材料单价应用所有同材质房间，不影响另一项目", () => {
    const d = blankDesign();
    d.rooms.push({
      ...d.rooms[0],
      id: "second",
      rings: [rect(6000, 0, 2000, 2000)],
    });
    const next = setPrice(d, "floorPrices", "wood", 100);
    expect(
      calculateCosts(next).hard.find((r) => r.key === "wood")!.subtotal,
    ).toBeCloseTo(40 * 1.05 * 100);
    expect(calculateCosts(d).hard.find((r) => r.key === "wood")!.price).toBe(
      320,
    );
  });
  it("同款数量联动而不同床款价格独立", () => {
    const d = blankDesign();
    const f = {
      id: "a",
      type: "bed",
      name: "双人床 1.8m",
      w: 1800,
      d: 2000,
      cx: 1000,
      cy: 1000,
      rot: 0,
      color: "#c9d6df",
    };
    d.furniture = [
      normalizeFurniture(f),
      { ...normalizeFurniture(f), id: "b", w: 1900 },
      normalizeFurniture({ ...f, id: "c", name: "双人床 1.5m", w: 1500 }),
    ];
    const c = calculateCosts(
      setPrice(d, "furniturePrices", furnitureKey(d.furniture[0]), 2000),
    );
    expect(c.soft).toHaveLength(2);
    expect(c.softTotal).toBe(4000);
    expect(c.soft.find((r) => r.quantity === 1)?.price).toBeNull();
  });
  it("墙面扣除门窗实际尺寸，共享隔墙两侧分别扣除", () => {
    const d = blankDesign();
    d.openings = [
      {
        id: "door",
        wallId: "outer-0",
        kind: "door",
        offset: 3000,
        width: 900,
        height: 2000,
      },
    ];
    expect(wallSurfaceArea(d.rooms[0], d)).toBeCloseTo(24 * 2.8 - 1.8);
  });
  it("新建与拆除互斥，人工加入硬装总额", () => {
    const d = blankDesign();
    d.walls.push({
      id: "new",
      a: [0, 3000],
      b: [6000, 3000],
      kind: "partition",
      thickness: 240,
    });
    d.demolished = ["new"];
    d.costSettings = {
      labor: [{ id: "labor", name: "施工", amount: 1000 }],
      constructionPrices: { build: 100, demolish: 50 },
    };
    const c = calculateCosts(d);
    expect(c.hard.some((r) => r.key === "build")).toBe(false);
    expect(c.hard.find((r) => r.key === "demolish")?.subtotal).toBeCloseTo(840);
    expect(c.hardTotal).toBeCloseTo(36 * 1.05 * 320 + 1840);
  });
  it("0与未定价不同，非法价格拒绝", () => {
    const d = blankDesign(),
      n = setPrice(d, "floorPrices", "wood", 0);
    expect(calculateCosts(n).hard.find((r) => r.key === "wood")?.price).toBe(0);
    expect(() => setPrice(d, "floorPrices", "wood", -1)).toThrow();
    expect(() => setPrice(d, "floorPrices", "wood", NaN)).toThrow();
  });
  it("带成本与颜色JSON往返，旧方案仍可读", () => {
    const d = setPrice(referenceDesign(), "floorPrices", "wood", 123);
    d.walls[0].color = "#aabbcc";
    const restored = validateDesign(JSON.parse(JSON.stringify(d)));
    expect(restored.costSettings?.floorPrices?.wood).toBe(123);
    expect(restored.walls[0].color).toBe("#aabbcc");
    expect(
      calculateCosts(validateDesign(referenceDesign())).total,
    ).toBeGreaterThan(0);
  });
});
