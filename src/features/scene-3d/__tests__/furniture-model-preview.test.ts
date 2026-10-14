import { describe, expect, it } from "vitest";
import { toFurnitureModel } from "../model/furniture-model";
import { buildFurniture } from "../model/furniture";
import { decorStyleById, furnitureLook } from "@/lib/floor-plan/decor-styles";
import type { LibraryItem } from "@/lib/floor-plan/types";

const sofa: LibraryItem = { catalogId: "c1", name: "布艺沙发", category: "客厅", type: "sofa", w: 2000, d: 900, color: "#998877" };

describe("家具详情的实时 3D 预览", () => {
  it("家具库条目转成原点处、未旋转的场景家具，缺高度时按类型补典型高度", () => {
    const f = toFurnitureModel(sofa);
    expect(f).toMatchObject({ id: "c1", type: "sofa", cx: 0, cy: 0, rot: 0, w: 2000, d: 900, color: "#998877" });
    expect(f.height).toBeGreaterThan(0);
    expect(toFurnitureModel({ ...sofa, height: 760 }).height).toBe(760);
  });
  it("默认风格保留家具自己的颜色，AI 3D 部件优先于参考几何", () => {
    const f = toFurnitureModel({ ...sofa, model3d: { version: 1, parts: [{ kind: "box", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#334455" }] } });
    expect(furnitureLook(decorStyleById(undefined), f).main).toBe("#998877");
    expect(buildFurniture(f, furnitureLook(decorStyleById(undefined), f)).children.length).toBeGreaterThan(0);
  });
});
