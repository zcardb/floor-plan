import { describe, expect, it } from "vitest";
import { builtinFloors, customFloorMaterial } from "@/lib/floor-plan/floor-materials";
import type { CustomFloor } from "@/lib/floor-plan/types";
import { floorSurface } from "../model/floor-texture";

const custom = (over: Partial<CustomFloor>): CustomFloor => ({
  key: "custom-00000000-0000-4000-8000-000000000000",
  name: "自定义地面",
  pattern: "tile",
  length: 600,
  width: 600,
  color: "#aabbcc",
  price: 100,
  ...over,
});

describe("地面贴图的画法", () => {
  it("内置地面沿用参考实现的真实尺寸、勾缝与粗糙度", () => {
    expect(floorSurface(builtinFloors.wood)).toMatchObject({ kind: "wood", sx: 1.8, sy: 0.36, roughness: 0.55 });
    expect(floorSurface(builtinFloors.walnut)).toMatchObject({ kind: "wood", sx: 1.8, sy: 0.36, roughness: 0.5 });
    expect(floorSurface(builtinFloors.tile800)).toMatchObject({ kind: "speckle", sx: 0.8, sy: 0.8, grout: "#cfc6b7", roughness: 0.3 });
    expect(floorSurface(builtinFloors.tile600)).toMatchObject({ kind: "speckle", sx: 0.6, sy: 0.6, grout: "#bfc6c1", roughness: 0.35 });
    expect(floorSurface(builtinFloors.antislip)).toMatchObject({ kind: "speckle", sx: 0.3, sy: 0.3, grout: "#aab2ac", roughness: 0.8 });
    expect(floorSurface(builtinFloors.marble)).toMatchObject({ kind: "marble", sx: 1.2, sy: 1.2, grout: "#d9d2c4", roughness: 0.18 });
    expect(floorSurface(builtinFloors.terrazzo)).toMatchObject({ kind: "terrazzo", sx: 0.5, sy: 0.5, roughness: 0.4 });
    expect(floorSurface(builtinFloors.carpet)).toMatchObject({ kind: "speckle", sx: 0.3, sy: 0.3, roughness: 1 });
    // 水磨石、地毯是整铺的，不画勾缝
    expect(floorSurface(builtinFloors.terrazzo).grout).toBeUndefined();
    expect(floorSurface(builtinFloors.carpet).grout).toBeUndefined();
  });

  it("自定义地面按铺贴样式与单块尺寸平铺", () => {
    const plank = floorSurface(customFloorMaterial(custom({ pattern: "plank", length: 1000, width: 150 })));
    expect(plank).toMatchObject({ kind: "wood", roughness: 0.55 });
    // 一张木纹贴图横向 1.5 块板长、纵向 2 块板宽
    expect(plank.sx).toBeCloseTo(1.5);
    expect(plank.sy).toBeCloseTo(0.3);
    const tile = floorSurface(customFloorMaterial(custom({ length: 600, width: 300 })));
    expect(tile).toMatchObject({ kind: "speckle", sx: 0.6, sy: 0.3 });
    expect(tile.grout).toMatch(/^rgb\(/);
    const seamless = floorSurface(customFloorMaterial(custom({ pattern: "seamless", length: undefined, width: undefined })));
    expect(seamless.kind).toBe("speckle");
    expect(seamless.grout).toBeUndefined();
  });

  it("与内置地面同名的自定义地面仍按自己的铺贴样式画", () => {
    const named = floorSurface(customFloorMaterial(custom({ name: builtinFloors.marble.name })));
    expect(named.kind).toBe("speckle");
    expect(named.sx).toBe(0.6);
  });
});
