import { it, expect } from "vitest";
import {
  procure,
  projectProcurement,
  validateProcurement,
} from "./materialProcurement";
import { blankDesign } from "../data/templates";
import { calculateCosts, setPrice } from "./costs";
import { validateDesign } from "./validation";
it("21平米、600砖、损耗5%、每箱4张得到62张和16箱", () => {
  const p = procure(21, {
    length: 600,
    width: 600,
    waste: 5,
    perBox: 4,
    unit: "箱",
  });
  expect(p.needed).toBe(62);
  expect(p.boxes).toBe(16);
  expect(p.sheets).toBe(64);
  expect(p.targetArea).toBeCloseTo(22.05);
  expect(p.purchasedArea).toBeCloseTo(23.04);
});
it("整除与略超边界正确取整，无规格仍面积计价", () => {
  expect(
    procure(4, { length: 1000, width: 1000, waste: 0, unit: "张" }).needed,
  ).toBe(4);
  expect(
    procure(4.001, { length: 1000, width: 1000, waste: 0, unit: "张" }).needed,
  ).toBe(5);
  expect(procure(4, { waste: 5, unit: "m²" }).needed).toBeNull();
});
it("缺尺寸、负损耗、非法箱数被拒绝", () => {
  for (const config of [
    { unit: "张", waste: 5 },
    { unit: "箱", waste: 5, length: 600, width: 600, perBox: 0 },
    { unit: "m²", waste: -2 },
    { unit: "m²", waste: 5, length: 0, width: 600 },
  ])
    expect(() =>
      validateProcurement(config as Parameters<typeof validateProcurement>[0]),
    ).toThrow();
});
it("按张、箱、实际平方米三种价格汇总一致", () => {
  const base = blankDesign();
  for (const [unit, price, total] of [
    ["张", 10, 1080],
    ["箱", 40, 1080],
    ["m²", 100, 3888],
  ] as const) {
    const d = setPrice(base, "floorPrices", "wood", price);
    d.costSettings!.procurement = {
      wood: { length: 600, width: 600, waste: 5, perBox: 4, unit },
    };
    const p = projectProcurement(d, "wood");
    expect(p.needed).toBe(105);
    expect(p.sheets).toBe(108);
    expect(
      calculateCosts(d).hard.find((r) => r.key === "wood")?.subtotal,
    ).toBeCloseTo(total);
  }
});
it("自定义目录及采购JSON完整往返", () => {
  const d = blankDesign();
  d.customCatalog = [
    {
      catalogId: "custom-a",
      name: "自己的椅子",
      category: "客厅",
      type: "chair",
      w: 500,
      d: 500,
      height: 800,
      color: "#aabbcc",
      price: 100,
    },
  ];
  d.costSettings = {
    procurement: { wood: { length: 1200, width: 150, waste: 8, unit: "张" } },
    furniturePrices: { "custom-a": 100 },
  };
  expect(
    validateDesign(JSON.parse(JSON.stringify(d))).customCatalog?.[0].name,
  ).toBe("自己的椅子");
  expect(calculateCosts(d).hard.find((r) => r.key === "wood")?.unit).toBe("张");
});
