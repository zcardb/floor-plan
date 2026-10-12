import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { library } from "../data/catalog";
import { DECOR_STYLES, METAL_FINISH, decorStyleById, furnitureLook, furnitureRole } from "../model/decorStyles";
import { sanitizeModel3d } from "../model/furniture3d";
import type { Furniture } from "../model/types";
import { buildFurniture } from "./furniture";

/** 参考实现（先住 view3d.js）精修过的 45 个家具类型，与家具库 catalog.ts 一一对应。 */
const REFERENCE_TYPES = [
  "bed", "sofa", "armchair", "cornersofa", "nightstand", "wardrobe", "cabinet", "shoecab", "ovencol", "dresser",
  "desk", "chair", "officechair", "bookshelf", "rug", "plant", "table", "coffeetable", "tvstand", "island",
  "counter", "roundtable", "sidetable", "barstool", "floorlamp", "beanbag", "toilet", "vanity", "shower", "bathtub",
  "washer", "dryer", "dishwasher", "fridge", "purifier", "aircon", "stove", "ksink", "baycushion", "crib",
  "tv", "acwall", "waterheater", "piano", "treadmill",
];
const catalogTypes = [...new Set(library.map((i) => i.type))];
/** 目录里出现的全部类型，加上不在目录里、但可以自定义的壁炉。 */
const allTypes = [...catalogTypes, "fireplace"];

const furnitureOf = (type: string, over: Partial<Furniture> = {}): Furniture => {
  const item = library.find((i) => i.type === type);
  return {
    id: `f-${type}`,
    type,
    name: item?.name ?? type,
    cx: 1500,
    cy: -800,
    w: item?.w ?? 600,
    d: item?.d ?? 600,
    rot: 30,
    color: item?.color ?? "#9a8c7c",
    ...over,
  };
};
const build = (f: Furniture, styleId = "default") => buildFurniture(f, furnitureLook(decorStyleById(styleId), f));
const meshes = (g: THREE.Object3D) => {
  const list: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) list.push(o);
  });
  return list;
};
const materials = (g: THREE.Object3D) => meshes(g).flatMap((o) => [o.material].flat() as THREE.MeshStandardMaterial[]);
function stats(g: THREE.Object3D) {
  let triangles = 0,
    finite = true;
  for (const o of meshes(g)) {
    const geo = o.geometry as THREE.BufferGeometry;
    triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    for (const name of ["position", "normal"])
      for (const v of geo.attributes[name].array as Float32Array) if (!Number.isFinite(v)) finite = false;
  }
  return { triangles, finite };
}
/** 每个网格的「颜色|粗糙度|金属度」，排序后比较两次构建的配色。 */
const palette = (g: THREE.Object3D) =>
  materials(g)
    .map((m) => `#${m.color.getHexString()}|${m.roughness}|${m.metalness}`)
    .sort();
const usesColor = (g: THREE.Object3D, hex: string) => palette(g).some((p) => p.startsWith(hex.toLowerCase() + "|"));
/** 顶点位置之和：同样的配色下比较形状（圆角大小）有没有变化。 */
const shape = (g: THREE.Object3D) =>
  meshes(g).reduce((s, o) => s + (o.geometry.attributes.position.array as Float32Array).reduce((a, v) => a + Math.abs(v), 0), 0);

describe("3D 家具模型", () => {
  it("家具库里的类型与参考实现的 45 个一一对应（楼梯另走通用外形）", () => {
    expect(catalogTypes.filter((t) => t !== "stairs").sort()).toEqual([...REFERENCE_TYPES].sort());
  });

  for (const styleId of ["default", "industrial", "cream"])
    it(`${styleId}：全部类型都能构建，几何有效、定位与 fid 正确、小组已合批`, () => {
      for (const type of allTypes) {
        const f = furnitureOf(type),
          g = build(f, styleId),
          { triangles, finite } = stats(g);
        expect(g, type).toBeInstanceOf(THREE.Group);
        expect(triangles, type).toBeGreaterThan(0);
        expect(finite, type).toBe(true);
        expect(g.userData.fid, type).toBe(f.id);
        expect(g.position.x, type).toBeCloseTo(1.5);
        expect(g.position.z, type).toBeCloseTo(-0.8);
        expect(g.rotation.y, type).toBeCloseTo((-30 * Math.PI) / 180);
        // 拉手、叶片、岛台柜体这类嵌套小组都已拍平，按材质合成少量网格
        expect(g.children.every((c) => c instanceof THREE.Mesh), type).toBe(true);
        const buckets = meshes(g).map((o) => `${(o.material as THREE.Material).uuid}:${o.castShadow}`);
        expect(new Set(buckets).size, type).toBe(buckets.length);
        // 精修类型都有自己的模型，不会落到 12 个三角形的通用方块
        if (REFERENCE_TYPES.includes(type)) expect(triangles, type).toBeGreaterThan(12);
      }
    });

  it("f.height 生效：模型整体等比缩放到指定高度", () => {
    for (const type of [...REFERENCE_TYPES, "fireplace"]) {
      const g = build(furnitureOf(type, { height: 1234 }));
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.max.y - box.min.y, type).toBeCloseTo(1.234, 3);
    }
  });

  it("带 model3d 的家具走 AI 分支，部件颜色不随风格变化", () => {
    const model3d = sanitizeModel3d({
      parts: [
        { kind: "box", x: 0, y: 0, z: 0, w: 1, h: 0.5, d: 1, color: "#123456" },
        { kind: "cylinder", x: 0, y: 0.5, z: 0, w: 0.2, h: 0.5, d: 0.2, color: "#abcdef", finish: "metal" },
      ],
    })!;
    const f = furnitureOf("sofa", { model3d }),
      plain = build(furnitureOf("sofa"));
    const byStyle = DECOR_STYLES.map((s) => palette(build(f, s.id)));
    expect(new Set(byStyle.map((p) => p.join())).size).toBe(1);
    expect(byStyle[0].map((p) => p.split("|")[0])).toEqual(["#123456", "#abcdef"]);
    expect(usesColor(build(f, "industrial"), furnitureLook(decorStyleById("industrial"), f).main)).toBe(false);
    // 不是参考沙发：两种部件、合成两个网格
    expect(build(f).children).toHaveLength(2);
    expect(stats(build(f)).triangles).toBeLessThan(stats(plain).triangles);
  });

  it("同一件沙发在 default 与 industrial 下主材质颜色不同", () => {
    const sofa = furnitureOf("sofa"),
      main = (id: string) => furnitureLook(decorStyleById(id), sofa).main;
    expect(main("default")).toBe(sofa.color);
    expect(main("industrial")).not.toBe(main("default"));
    const plain = build(sofa, "default"),
      industrial = build(sofa, "industrial");
    expect(usesColor(plain, main("default"))).toBe(true);
    expect(usesColor(industrial, main("industrial"))).toBe(true);
    expect(usesColor(industrial, main("default"))).toBe(false);
    expect(palette(industrial)).not.toEqual(palette(plain));
  });

  it("冰箱在任意风格下颜色不变；没有配色角色的家电、洁具连形状都不随风格变化", () => {
    const fridge = furnitureOf("fridge"),
      base = palette(build(fridge));
    expect(usesColor(build(fridge), fridge.color)).toBe(true);
    for (const s of DECOR_STYLES) expect(palette(build(fridge, s.id)), s.id).toEqual(base);
    for (const type of [...REFERENCE_TYPES, "fireplace"].filter((t) => !furnitureRole(t))) {
      const f = furnitureOf(type),
        colors = palette(build(f)),
        size = shape(build(f));
      for (const s of DECOR_STYLES) {
        const g = build(f, s.id);
        expect(palette(g), `${type} @ ${s.id}`).toEqual(colors);
        expect(shape(g), `${type} @ ${s.id}`).toBeCloseTo(size, 6);
      }
    }
  });

  it("风格决定腿型、五金与圆角", () => {
    const sofa = furnitureOf("sofa"),
      wardrobe = furnitureOf("wardrobe"),
      plain = decorStyleById("default"),
      industrial = decorStyleById("industrial"),
      cream = decorStyleById("cream"),
      finish = (id: string) => {
        const m = METAL_FINISH[decorStyleById(id).metal];
        return `${m.color}|${m.roughness}|${m.metalness}`;
      };
    // 期望值全部从风格数据推出；前提变了（风格重新调色）要在这里一眼看出
    expect(plain.legsKind, plain.name).toBe("wood");
    expect(industrial.legsKind, industrial.name).toBe("metal");
    expect(cream.metal, cream.name).not.toBe(plain.metal);
    // 木腿风格：深色收边色的收分木腿；金属腿风格：收边色 + 风格五金质感
    expect(palette(build(sofa))).toContain(`${plain.legs}|0.55|0`);
    const metal = METAL_FINISH[industrial.metal];
    expect(palette(build(sofa, "industrial"))).toContain(`${industrial.legs}|${metal.roughness}|${metal.metalness}`);
    // 拉手跟风格五金走
    expect(palette(build(wardrobe, "cream"))).toContain(finish("cream"));
    expect(palette(build(wardrobe, "cream"))).not.toContain(finish("default"));
    expect(palette(build(wardrobe))).toContain(finish("default"));
    // 圆角只跟 softness 走：同样配色下，软一点的沙发顶点位置不同，外框基本不变（斜放的靠垫圆角变大会略收几毫米）
    const look = furnitureLook(decorStyleById("default"), sofa),
      soft = buildFurniture(sofa, { ...look, softness: 1.3 }),
      crisp = buildFurniture(sofa, { ...look, softness: 0.8 });
    expect(palette(soft)).toEqual(palette(crisp));
    expect(shape(soft)).not.toBeCloseTo(shape(crisp), 3);
    const size = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    expect(size(soft).distanceTo(size(crisp))).toBeLessThan(0.01);
  });
});

