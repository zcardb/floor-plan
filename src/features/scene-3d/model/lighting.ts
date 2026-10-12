import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { area, bbox, center, inRoom } from "@/lib/floor-plan/geometry";
import type { Point, Room } from "@/lib/floor-plan/types";
import { mat } from "./furniture";

/**
 * 昼夜灯光参数（夜间取值来自参考实现「先住」）。白天太阳的方向仍按日照时刻计算，见 Scene3D。
 * 昼夜切换只改这些数值：不重建几何，也不增删灯，所以不会触发着色器重新编译。
 */
export function nightLighting(night: boolean) {
  return {
    /** 色调映射曝光：夜里提亮一点，房间里的灯光才显得暖。 */
    exposure: night ? 1.25 : 1.05,
    background: night ? "#1c2130" : "#f3efe7",
    /** 场景外的大地面。 */
    ground: night ? "#2a2e38" : "#f2eee7",
    sun: night ? 0.05 : 2.5,
    hemi: night ? 0.12 : 1.4,
    /** 环境反射强度系数：夜里压低，否则金属会映出白天的房间。 */
    env: night ? 0.15 : 1,
    /** 吸顶灯点光源的强度；白天为 0，灯仍留在场景里。 */
    lampLight: night ? 6 : 0,
  };
}

/** 夜里发光件（吸顶灯盘、台灯与落地灯灯罩、屏幕、指示灯、灯带）的自发光强度下限。 */
export const NIGHT_GLOW = 2;
/** 发光件的自发光强度：白天用材质自己的取值，夜里至少提到 NIGHT_GLOW（吸顶灯盘 0.3 → 2）。 */
export const glowIntensity = (day: number, night: boolean) => (night ? Math.max(day, NIGHT_GLOW) : day);

/** 吸顶灯：灯盘造型与点光源参数。 */
export const ROOM_LAMP = {
  radius: 0.22,
  thickness: 0.02,
  /** 灯盘中心在天花下方多远：盘面贴着天花。 */
  discDrop: 0.012,
  /** 点光源在天花下方多远。 */
  lightDrop: 0.25,
  /** 灯盘白天的自发光强度。 */
  glow: 0.3,
  emissive: "#fff2d6",
  color: "#ffd9a8",
  distance: 7,
  decay: 1.6,
};
/**
 * 最多给多少个房间开灯。WebGL 前向渲染里，每盏点光源都要在每个受光像素上算一遍，
 * 灯的数量还写在着色器里：灯越多帧率越低，手机上还可能超出片元 uniform 上限、着色器编译失败。
 * 所以房间再多，也只给面积最大的 16 间开灯。
 */
export const MAX_ROOM_LAMPS = 16;

export interface RoomLamp {
  roomId: string;
  /** 灯的平面位置（米）：一般是房间中心。 */
  x: number;
  z: number;
  /** 灯盘中心高度。 */
  discY: number;
  /** 点光源高度。 */
  lightY: number;
  /** 灯盘只在剖切高度达到层高（看得到天花）时显示；剖切后从上往下看时不显示，点光源照常照亮房间。 */
  visible: boolean;
}
/** 点到房间边线（含内洞）的最近距离（毫米）。 */
function clearance(p: Point, room: Room) {
  let nearest = Infinity;
  for (const ring of room.rings)
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      nearest = Math.min(nearest, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
    });
  return nearest;
}
/** 灯盘离墙至少这么远（毫米）才算装得下：灯盘半径 220 加一点余量。 */
const LAMP_CLEARANCE = 400;
/**
 * 灯装在哪：房间中心通常就是正中。L 形、带内洞的房间，中心会落在墙边甚至房间外，
 * 这时改在房间里找离墙最远的位置，免得灯盘嵌进墙里、灯光缩在墙角。
 */
function lampSpot(room: Room): Point {
  const c = center(room);
  let best = c,
    far = inRoom(c, room) ? clearance(c, room) : -1;
  if (far >= LAMP_CLEARANCE) return c;
  const b = bbox(room.rings[0]),
    step = Math.max(100, Math.max(b.x2 - b.x, b.y2 - b.y) / 48);
  for (let y = b.y + step / 2; y < b.y2; y += step)
    for (let x = b.x + step / 2; x < b.x2; x += step) {
      const p: Point = [x, y];
      if (!inRoom(p, room)) continue;
      const k = clearance(p, room);
      if (k > far) {
        far = k;
        best = p;
      }
    }
  return best;
}
/** 每个计入面积的房间一盏吸顶灯，装在天花中心；ceiling 为层高、cut 为当前剖切高度（米）。 */
export function roomLamps(rooms: Room[], ceiling: number, cut: number): RoomLamp[] {
  return rooms
    .filter((r) => r.counted !== false)
    .map((r) => ({ r, size: area(r) }))
    .filter(({ size }) => size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_ROOM_LAMPS)
    .map(({ r }) => {
      const [x, y] = lampSpot(r);
      return {
        roomId: r.id,
        x: x / 1000,
        z: y / 1000,
        discY: ceiling - ROOM_LAMP.discDrop,
        lightY: ceiling - ROOM_LAMP.lightDrop,
        visible: cut >= ceiling,
      };
    });
}
/**
 * 吸顶灯的场景对象：看得到的灯盘合成一个网格，另外每盏灯一个点光源。
 * 点光源白天也留在场景里、强度为 0——灯的数量写在着色器里，开关灯时增删会让所有材质重新编译。
 */
export function buildRoomLamps(lamps: RoomLamp[], night: boolean) {
  const objects: THREE.Object3D[] = [],
    discs = lamps
      .filter((l) => l.visible)
      .map((l) =>
        new THREE.CylinderGeometry(ROOM_LAMP.radius, ROOM_LAMP.radius, ROOM_LAMP.thickness, 32).translate(l.x, l.discY, l.z),
      );
  if (discs.length) {
    const geometry = discs.length === 1 ? discs[0] : mergeGeometries(discs);
    if (discs.length > 1) discs.forEach((g) => g.dispose());
    // 发光强度由 mat() 记进 userData.glow，夜里由场景材质副本调亮
    if (geometry) objects.push(new THREE.Mesh(geometry, mat("#ffffff", 1, 0, { emissive: ROOM_LAMP.emissive, emissiveIntensity: ROOM_LAMP.glow })));
  }
  const { lampLight } = nightLighting(night);
  for (const l of lamps) {
    const light = new THREE.PointLight(ROOM_LAMP.color, lampLight, ROOM_LAMP.distance, ROOM_LAMP.decay);
    light.position.set(l.x, l.lightY, l.z);
    objects.push(light);
  }
  return objects;
}

/** 场景外的大地面：白天接住房子的影子，夜里映出屋里漏出来的灯光。 */
export function createGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({
      color: nightLighting(false).ground,
      roughness: 1,
      // 比房间地面低 1.5 cm，再加上深度偏移：镜头拉到最远也叠不出闪烁
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  return ground;
}

/** 昼夜切换要动到的场景对象；Scene3D 的运行时本身就满足这个形状。 */
export interface LightRig {
  renderer: { toneMappingExposure: number };
  scene: THREE.Scene;
  sun: THREE.Light;
  hemi: THREE.Light;
  ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** buildRoomLamps 的产物所在的组。 */
  lamps: THREE.Object3D;
  /** 本场景的材质副本：反射强度与发光件跟着昼夜变。 */
  materials: { setNight(night: boolean): void };
}
/** 应用昼夜参数：只改灯光、颜色、曝光和本场景的材质副本，不碰几何。 */
export function applyLighting(rig: LightRig, night: boolean) {
  const light = nightLighting(night);
  rig.renderer.toneMappingExposure = light.exposure;
  rig.scene.background = new THREE.Color(light.background);
  rig.ground.material.color.set(light.ground);
  rig.sun.intensity = light.sun;
  rig.hemi.intensity = light.hemi;
  for (const o of rig.lamps.children) if (o instanceof THREE.PointLight) o.intensity = light.lampLight;
  rig.materials.setNight(night);
}
