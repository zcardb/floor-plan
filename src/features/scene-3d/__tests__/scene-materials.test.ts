import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { library } from "@/lib/floor-plan/catalog";
import { decorStyleById, furnitureLook } from "@/lib/floor-plan/decor-styles";
import type { Furniture } from "@/lib/floor-plan/types";
import { buildFurniture } from "../model/furniture";
import { NIGHT_GLOW } from "../model/lighting";
import { createSceneMaterials } from "../model/scene-materials";

const furnitureOf = (type: string): Furniture => {
  const item = library.find((i) => i.type === type)!;
  return { id: `f-${type}`, type, name: item.name, cx: 0, cy: 0, w: item.w, d: item.d, rot: 0, color: item.color };
};
const build = (type: string) => {
  const f = furnitureOf(type);
  return buildFurniture(f, furnitureLook(decorStyleById("default"), f));
};
const meshes = (g: THREE.Object3D) => {
  const list: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) list.push(o);
  });
  return list;
};
const materials = (g: THREE.Object3D) => meshes(g).flatMap((o) => [o.material].flat() as THREE.MeshStandardMaterial[]);
/** 构建时的原件，按网格记下：adopt 之后网格上换成了副本。 */
const originalsOf = (...roots: THREE.Object3D[]) =>
  new Map(roots.flatMap(meshes).map((o) => [o, o.material as THREE.MeshStandardMaterial]));
const glowing = (g: THREE.Object3D) => materials(g).filter((m) => m.userData.glow);

describe("场景材质副本", () => {
  it("环境反射只挂到金属 / 光滑材质的副本，缓存里的原件保持不挂", () => {
    const env = new THREE.Texture(),
      scope = createSceneMaterials(env),
      wardrobe = build("wardrobe"),
      shower = build("shower"),
      originals = originalsOf(wardrobe, shower);
    scope.adopt(wardrobe);
    scope.adopt(shower);
    let glossy = 0;
    for (const [mesh, original] of originals) {
      const m = mesh.material as THREE.MeshStandardMaterial,
        shiny = original.metalness > 0 || original.roughness < 0.4,
        glass = original.transparent && original.opacity < 0.3;
      expect(original.envMap).toBeNull();
      expect(m.envMap === env).toBe(shiny && !glass);
      if (m.envMap) {
        glossy++;
        expect(m.envMapIntensity).toBe(original.metalness > 0.5 ? 1 : 0.5);
        expect(m.color.getHex()).toBe(original.color.getHex());
      } else expect(m).toBe(original);
    }
    expect(glossy).toBeGreaterThan(1);
    // 重建同一件家具时复用副本，夜景压低强度，释放后副本被销毁
    const again = build("wardrobe");
    scope.adopt(again);
    const copy = materials(again).find((m) => m.envMap)!;
    expect(materials(wardrobe)).toContain(copy);
    // 已经是副本的材质再 adopt 一次不会再套一层
    scope.adopt(again);
    expect(materials(again)).toContain(copy);
    const day = copy.envMapIntensity;
    scope.setNight(true);
    expect(copy.envMapIntensity).toBeCloseTo(day * 0.15);
    scope.setNight(false);
    expect(copy.envMapIntensity).toBe(day);
    let disposed = false;
    copy.addEventListener("dispose", () => (disposed = true));
    scope.dispose();
    expect(disposed).toBe(true);
  });

  it("发光件夜里调亮、白天恢复，缓存里的原件不动", () => {
    const scope = createSceneMaterials(new THREE.Texture()),
      lamp = build("floorlamp"),
      tv = build("tv"),
      vanity = build("vanity"),
      originals = originalsOf(lamp, tv, vanity),
      dayOf = new Map([...originals.values()].map((m) => [m, m.emissiveIntensity]));
    // 落地灯的灯罩与灯泡、电视屏幕、浴室镜后的灯带都打了发光标记，记的是白天的强度
    expect(glowing(lamp).map((m) => m.userData.glow).sort()).toEqual([0.45, 1.2]);
    expect(glowing(tv).map((m) => m.userData.glow)).toEqual([0.35]);
    expect(glowing(vanity).map((m) => m.userData.glow)).toEqual([0.9]);
    for (const g of [lamp, tv, vanity]) scope.adopt(g);
    const check = (night: boolean) => {
      let lit = 0;
      for (const [mesh, original] of originals) {
        const m = mesh.material as THREE.MeshStandardMaterial,
          day = dayOf.get(original)!;
        // 原件永远是白天的样子：别的渲染器还在用它
        expect(original.emissiveIntensity).toBe(day);
        if (!original.userData.glow) {
          expect(m.emissiveIntensity).toBe(day);
          continue;
        }
        lit++;
        expect(m).not.toBe(original);
        expect(m.emissive.getHex()).toBe(original.emissive.getHex());
        expect(m.emissiveIntensity).toBe(night ? NIGHT_GLOW : day);
      }
      expect(lit).toBe(4);
    };
    check(false);
    scope.setNight(true);
    check(true);
    scope.setNight(false);
    check(false);
  });

  it("每个场景各改各的副本：一个场景入夜不影响另一个", () => {
    const env = new THREE.Texture(),
      night = createSceneMaterials(env),
      day = createSceneMaterials(new THREE.Texture()),
      a = build("tv"),
      b = build("tv");
    night.adopt(a);
    day.adopt(b);
    night.setNight(true);
    const [screenA] = glowing(a),
      [screenB] = glowing(b);
    expect(screenA).not.toBe(screenB);
    expect(screenA.emissiveIntensity).toBe(NIGHT_GLOW);
    expect(screenB.emissiveIntensity).toBe(0.35);
    // 屏幕既发光又反光：同一个副本两样都改，贴图用的是各自场景的
    expect(screenA.envMap).toBe(env);
    expect(screenB.envMap).not.toBe(env);
    expect(screenA.envMapIntensity).toBeCloseTo(screenB.envMapIntensity * 0.15);
  });

  it("夜里重建的家具直接拿到夜间取值", () => {
    const scope = createSceneMaterials(new THREE.Texture());
    scope.setNight(true);
    const lamp = build("floorlamp"),
      fridge = build("fridge");
    scope.adopt(lamp);
    scope.adopt(fridge);
    expect(glowing(lamp).map((m) => m.emissiveIntensity)).toEqual([NIGHT_GLOW, NIGHT_GLOW]);
    const metal = materials(fridge).find((m) => m.envMap && m.metalness > 0.5)!;
    expect(metal.envMapIntensity).toBeCloseTo(0.15);
  });

  it("环境贴图生成失败时不挂反射，发光件照样跟着昼夜变", () => {
    const scope = createSceneMaterials(null),
      tv = build("tv"),
      fridge = build("fridge"),
      originals = originalsOf(fridge);
    scope.adopt(tv);
    scope.adopt(fridge);
    scope.setNight(true);
    expect(glowing(tv)[0].emissiveIntensity).toBe(NIGHT_GLOW);
    expect(glowing(tv)[0].envMap).toBeNull();
    // 不发光的金属件没什么要改，继续共用原件
    for (const [mesh, original] of originals) if (!original.userData.glow) expect(mesh.material).toBe(original);
  });
});
