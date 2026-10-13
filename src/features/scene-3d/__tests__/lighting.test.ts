import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { library } from "@/lib/floor-plan/catalog";
import { decorStyleById, furnitureLook } from "@/lib/floor-plan/decor-styles";
import { inRoom } from "@/lib/floor-plan/geometry";
import type { Furniture, Point, Room } from "@/lib/floor-plan/types";
import { buildFurniture } from "../model/furniture";
import {
  MAX_ROOM_LAMPS,
  NIGHT_GLOW,
  ROOM_LAMP,
  applyLighting,
  buildRoomLamps,
  createGround,
  glowIntensity,
  nightLighting,
  roomLamps,
  type LightRig,
} from "../model/lighting";
import { createSceneMaterials } from "../model/scene-materials";

/** 左上角在 (x, y)、宽 w 深 d 的矩形房间（毫米）。 */
const rect = (id: string, x: number, y: number, w: number, d: number, over: Partial<Room> = {}): Room => ({
  id,
  name: id,
  rings: [[[x, y], [x + w, y], [x + w, y + d], [x, y + d]]],
  mat: "wood",
  ...over,
});
const hex = (c: THREE.Color) => "#" + c.getHexString();
const pointLights = (objects: THREE.Object3D[]) => objects.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
const discs = (objects: THREE.Object3D[]) => objects.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);

describe("昼夜灯光参数", () => {
  it("白天与夜晚的取值", () => {
    expect(nightLighting(false)).toEqual({
      exposure: 1.05,
      background: "#f3efe7",
      ground: "#f2eee7",
      sun: 2.5,
      hemi: 1.4,
      env: 1,
      lampLight: 0,
    });
    expect(nightLighting(true)).toEqual({
      exposure: 1.25,
      background: "#1c2130",
      ground: "#2a2e38",
      sun: 0.05,
      hemi: 0.12,
      env: 0.15,
      lampLight: 6,
    });
  });

  it("发光件白天用自己的强度，夜里提到 2，本来更亮的不压暗", () => {
    expect(NIGHT_GLOW).toBe(2);
    expect(glowIntensity(ROOM_LAMP.glow, false)).toBe(0.3);
    expect(glowIntensity(ROOM_LAMP.glow, true)).toBe(2);
    expect(glowIntensity(0.35, true)).toBe(2);
    expect(glowIntensity(1.2, false)).toBe(1.2);
    expect(glowIntensity(3, true)).toBe(3);
  });
});

describe("吸顶灯", () => {
  const rooms = [rect("living", 0, 0, 5000, 4000), rect("bed", 5000, 0, 3000, 4000)];

  it("每个房间在天花中心一盏：灯盘贴着天花，点光源在天花下方 0.25 m", () => {
    const lamps = roomLamps(rooms, 2.8, 2.8);
    expect(lamps.map((l) => l.roomId)).toEqual(["living", "bed"]);
    expect(lamps[0]).toMatchObject({ x: 2.5, z: 2, visible: true });
    expect(lamps[0].discY).toBeCloseTo(2.788);
    expect(lamps[0].lightY).toBeCloseTo(2.55);
    expect(lamps[1]).toMatchObject({ x: 6.5, z: 2 });
  });

  it("灯盘随剖切高度显示 / 隐藏，点光源的位置不跟着剖切走", () => {
    const full = roomLamps(rooms, 2.8, 2.8),
      cut = roomLamps(rooms, 2.8, 1.2);
    expect(full.every((l) => l.visible)).toBe(true);
    expect(cut.every((l) => !l.visible)).toBe(true);
    // 剖切只藏灯盘：灯还在原来的高度照亮房间
    expect(cut.map((l) => [l.x, l.z, l.lightY])).toEqual(full.map((l) => [l.x, l.z, l.lightY]));
    // 层高不是 2.8 m 时按实际层高判断
    expect(roomLamps(rooms, 3.3, 2.8)[0].visible).toBe(false);
    expect(roomLamps(rooms, 3.3, 3.3)[0]).toMatchObject({ visible: true });
    expect(roomLamps(rooms, 3.3, 3.3)[0].lightY).toBeCloseTo(3.05);
  });

  it("不计面积的飘窗、没有面积的房间不装灯", () => {
    const lamps = roomLamps([rect("room", 0, 0, 3000, 3000), rect("bay", 3000, 0, 1800, 600, { counted: false }), rect("empty", 0, 0, 0, 3000)], 2.8, 2.8);
    expect(lamps.map((l) => l.roomId)).toEqual(["room"]);
  });

  it("中心落在房间外或贴着墙时，灯改装在离墙最远的地方，灯盘不嵌进墙里", () => {
    /** 灯盘外接正方形的四个角都在房间里。 */
    const fits = (room: Room) => {
      const [lamp] = roomLamps([room], 2.8, 2.8),
        r = ROOM_LAMP.radius * 1000;
      return [[-r, -r], [r, -r], [r, r], [-r, r]].every(([dx, dy]) => inRoom([lamp.x * 1000 + dx, lamp.z * 1000 + dy], room));
    };
    // L 形：包围盒中心 (3000, 3000) 在房间外
    const elbow: Point[] = [[0, 0], [6000, 0], [6000, 1500], [1500, 1500], [1500, 6000], [0, 6000]];
    expect(fits({ id: "L", name: "L", rings: [elbow], mat: "wood" })).toBe(true);
    // 中间有一根柱子（内洞）：中心在洞里
    const column: Point[] = [[1800, 1800], [2200, 1800], [2200, 2200], [1800, 2200]];
    expect(fits({ ...rect("hall", 0, 0, 4000, 4000), rings: [rect("hall", 0, 0, 4000, 4000).rings[0], column] })).toBe(true);
    // 凹角几乎顶到中心：中心在房间里，但离墙只有 5 cm
    const notch: Point[] = [[0, 0], [4000, 0], [4000, 4000], [2050, 4000], [2050, 2050], [0, 2050]];
    expect(fits({ id: "notch", name: "notch", rings: [notch], mat: "wood" })).toBe(true);
    // 窄过道装不下也不乱跑：仍在正中
    expect(roomLamps([rect("hall", 0, 0, 700, 4000)], 2.8, 2.8)[0]).toMatchObject({ x: 0.35, z: 2 });
  });

  it(`房间超过 ${MAX_ROOM_LAMPS} 间时只给面积最大的 ${MAX_ROOM_LAMPS} 间开灯`, () => {
    expect(MAX_ROOM_LAMPS).toBe(16);
    // 20 间，面积从小到大排着进来
    const many = Array.from({ length: 20 }, (_, i) => rect(`r${i}`, i * 6000, 0, 1000 + i * 200, 3000)),
      lamps = roomLamps(many, 2.8, 2.8);
    expect(lamps).toHaveLength(16);
    expect(lamps.map((l) => l.roomId).sort()).toEqual(many.slice(4).map((r) => r.id).sort());
    expect(roomLamps(many.slice(0, 16), 2.8, 2.8)).toHaveLength(16);
  });

  it("场景对象：看得到天花时才有灯盘，点光源昼夜都在、只是白天强度为 0", () => {
    const day = buildRoomLamps(roomLamps(rooms, 2.8, 2.8), false),
      night = buildRoomLamps(roomLamps(rooms, 2.8, 2.8), true),
      cut = buildRoomLamps(roomLamps(rooms, 2.8, 1.2), true);
    // 灯盘合成一个网格，不投影
    expect(discs(day)).toHaveLength(1);
    expect(discs(cut)).toHaveLength(0);
    const disc = discs(day)[0],
      material = disc.material as THREE.MeshStandardMaterial,
      box = new THREE.Box3().setFromObject(disc);
    expect(disc.castShadow).toBe(false);
    expect(hex(material.color)).toBe("#ffffff");
    expect(hex(material.emissive)).toBe("#fff2d6");
    expect(material.emissiveIntensity).toBe(0.3);
    expect(material.userData.glow).toBe(0.3);
    // 两个半径 0.22 m 的圆盘：从客厅灯的左缘到卧室灯的右缘，厚 2 cm、顶面在天花下 2 mm
    expect(box.min.x).toBeCloseTo(2.5 - 0.22);
    expect(box.max.x).toBeCloseTo(6.5 + 0.22);
    expect(box.max.y).toBeCloseTo(2.798);
    expect(box.max.y - box.min.y).toBeCloseTo(0.02);
    for (const [objects, intensity] of [[day, 0], [night, 6], [cut, 6]] as const) {
      const lights = pointLights(objects);
      expect(lights).toHaveLength(2);
      for (const light of lights) {
        expect(light.intensity).toBe(intensity);
        expect(hex(light.color)).toBe("#ffd9a8");
        expect(light.distance).toBe(7);
        expect(light.decay).toBe(1.6);
        expect(light.castShadow).toBe(false);
        expect(light.position.y).toBeCloseTo(2.55);
      }
      expect(lights.map((l) => [l.position.x, l.position.z])).toEqual([[2.5, 2], [6.5, 2]]);
    }
    // 昼夜两次构建灯的数量一样：灯数写在着色器里，变了就要重新编译
    expect(pointLights(day)).toHaveLength(pointLights(night).length);
  });
});

describe("昼夜切换", () => {
  const furnitureOf = (type: string): Furniture => {
    const item = library.find((i) => i.type === type)!;
    return { id: `f-${type}`, type, name: item.name, cx: 0, cy: 0, w: item.w, d: item.d, rot: 0, color: item.color };
  };
  /** 与 Scene3D 运行时同样形状的一套场景对象，不需要 WebGL。 */
  function rig() {
    const scene = new THREE.Scene(),
      sun = new THREE.DirectionalLight("#fff2dc", 3),
      hemi = new THREE.HemisphereLight("#fff9ec", "#b4a58e", 1.5),
      ground = createGround(),
      lamps = new THREE.Group(),
      furn = new THREE.Group(),
      materials = createSceneMaterials(null),
      lamp = furnitureOf("floorlamp");
    lamps.add(...buildRoomLamps(roomLamps([rect("living", 0, 0, 5000, 4000)], 2.8, 2.8), false));
    furn.add(buildFurniture(lamp, furnitureLook(decorStyleById("default"), lamp)));
    scene.add(sun, hemi, ground, lamps, furn);
    materials.adopt(lamps);
    materials.adopt(furn);
    const r: LightRig = { renderer: { toneMappingExposure: 1 }, scene, sun, hemi, ground, lamps, materials };
    return { ...r, furn, materials };
  }
  const glows = (root: THREE.Object3D) => {
    const list: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData.glow) list.push(o.material);
    });
    return list;
  };
  const snapshot = (r: ReturnType<typeof rig>) => ({
    exposure: r.renderer.toneMappingExposure,
    background: hex(r.scene.background as THREE.Color),
    ground: hex(r.ground.material.color),
    sun: r.sun.intensity,
    hemi: r.hemi.intensity,
    lights: pointLights(r.lamps.children).map((l) => l.intensity),
    disc: glows(r.lamps).map((m) => m.emissiveIntensity),
    furniture: glows(r.furn)
      .map((m) => m.emissiveIntensity)
      .sort(),
  });
  const DAY = { exposure: 1.05, background: "#f3efe7", ground: "#f2eee7", sun: 2.5, hemi: 1.4, lights: [0], disc: [0.3], furniture: [0.45, 1.2] },
    NIGHT = { exposure: 1.25, background: "#1c2130", ground: "#2a2e38", sun: 0.05, hemi: 0.12, lights: [6], disc: [2], furniture: [2, 2] };

  it("入夜：曝光、背景、地面、日光、房间灯与发光件一起变；回到白天全部恢复", () => {
    const r = rig();
    applyLighting(r, false);
    expect(snapshot(r)).toEqual(DAY);
    applyLighting(r, true);
    expect(snapshot(r)).toEqual(NIGHT);
    applyLighting(r, false);
    expect(snapshot(r)).toEqual(DAY);
  });

  it("切换昼夜不重建几何、不换材质、不增删灯", () => {
    const r = rig(),
      parts = () => {
        const list: unknown[] = [];
        r.scene.traverse((o) => {
          list.push(o);
          if (o instanceof THREE.Mesh) list.push(o.geometry, o.material);
        });
        return list;
      },
      before = parts();
    applyLighting(r, true);
    applyLighting(r, false);
    applyLighting(r, true);
    const after = parts();
    expect(after).toHaveLength(before.length);
    after.forEach((o, i) => expect(o).toBe(before[i]));
  });

  it("夜里重建墙体时，新建的吸顶灯直接是亮的", () => {
    const r = rig();
    applyLighting(r, true);
    r.lamps.clear();
    r.lamps.add(...buildRoomLamps(roomLamps([rect("living", 0, 0, 5000, 4000)], 2.8, 2.8), true));
    r.materials.adopt(r.lamps);
    expect(snapshot(r)).toEqual(NIGHT);
  });

  it("大地面：水平铺在房间地面下方 1.5 cm，接收阴影", () => {
    const ground = createGround();
    expect(ground.position.y).toBe(-0.015);
    expect(ground.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(ground.receiveShadow).toBe(true);
    expect(ground.castShadow).toBe(false);
    expect(ground.material.roughness).toBe(1);
    expect(ground.material.polygonOffset).toBe(true);
    expect(hex(ground.material.color)).toBe("#f2eee7");
  });
});
