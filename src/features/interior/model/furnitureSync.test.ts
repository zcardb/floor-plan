import { describe, expect, it } from "vitest";
import { blankDesign } from "../data/templates";
import { syncAccountFurniture } from "./furnitureSync";
import { furnitureDraftOf, parseFurnitureDraft } from "./furnitureDraft";
import type { Furniture, LibraryItem } from "./types";

const entry: LibraryItem = { catalogId: "c1", name: "布艺沙发", category: "客厅", type: "sofa", shape: "reference", w: 2000, d: 900, height: 800, color: "#aaaaaa", price: 3000 };
const placed = (over: Partial<Furniture> = {}): Furniture => ({ id: "f1", catalogId: "c1", name: "布艺沙发", type: "sofa", shape: "reference", cx: 0, cy: 0, w: 2000, d: 900, rot: 0, color: "#aaaaaa", height: 800, ...over });

describe("账号家具同步到项目", () => {
  it("目录条目跟随账号库，单价保留项目里的值", () => {
    const design = { ...blankDesign(), customCatalog: [entry], furniture: [placed()] };
    const next = syncAccountFurniture(design, [{ ...entry, name: "皮沙发", w: 2200, color: "#333333", price: 5000, imageUrl: "https://x/a.webp" }])!;
    expect(next.customCatalog?.[0]).toMatchObject({ name: "皮沙发", w: 2200, color: "#333333", price: 3000, imageUrl: "https://x/a.webp" });
    expect(next.furniture[0]).toMatchObject({ name: "皮沙发", w: 2200, color: "#333333", imageUrl: "https://x/a.webp" });
  });
  it("项目里单独改过的尺寸 / 颜色不被覆盖", () => {
    const design = { ...blankDesign(), customCatalog: [entry], furniture: [placed({ w: 1600, color: "#ff0000" })] };
    const next = syncAccountFurniture(design, [{ ...entry, w: 2200, d: 1000, color: "#333333" }])!;
    expect(next.furniture[0]).toMatchObject({ w: 1600, d: 1000, color: "#ff0000" });
  });
  it("没有变化或没有同款时返回 null", () => {
    const design = { ...blankDesign(), customCatalog: [entry], furniture: [placed()] };
    expect(syncAccountFurniture(design, [entry])).toBeNull();
    expect(syncAccountFurniture(design, [{ ...entry, catalogId: "other", name: "别的" }])).toBeNull();
  });
});

describe("家具表单草稿", () => {
  it("编辑草稿回填后原样解析", () => {
    expect(parseFurnitureDraft(furnitureDraftOf(entry))).toMatchObject({ name: "布艺沙发", type: "sofa", w: 2000, d: 900, height: 800, price: 3000 });
  });
  it("圆形深度等于直径；无效尺寸或负价返回 null", () => {
    expect(parseFurnitureDraft({ ...furnitureDraftOf(entry), shape: "circle", w: "1.2" })).toMatchObject({ w: 1200, d: 1200 });
    expect(parseFurnitureDraft({ ...furnitureDraftOf(entry), w: "0.01" })).toBeNull();
    expect(parseFurnitureDraft({ ...furnitureDraftOf(entry), price: "-1" })).toBeNull();
  });
});
