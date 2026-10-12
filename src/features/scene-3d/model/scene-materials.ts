import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { glowIntensity, nightLighting } from "./lighting";

/** 用 RoomEnvironment 预滤波出环境贴图，每个渲染器生成一次；失败时返回 null，照常渲染、只是没有反射。 */
export function createEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  try {
    return pmrem.fromScene(room, 0.04);
  } catch {
    return null;
  } finally {
    room.dispose();
    pmrem.dispose();
  }
}

export interface SceneMaterials {
  /** 把 root 下要挂反射或会发光的材质换成本场景的副本；按原件缓存，重建家具时复用。 */
  adopt(root: THREE.Object3D): void;
  /** 昼夜切换：只改本场景的副本——夜里压低反射、调亮发光件，白天恢复。 */
  setNight(night: boolean): void;
  dispose(): void;
}
/**
 * 一个场景自己的材质副本。mat() 缓存里的原件是所有渲染器共用的，而：
 * - 环境贴图属于生成它的渲染器，不能跨 WebGL 上下文共用；
 * - 昼夜是每个场景各自的状态，直接改原件会把别的渲染器、预览图一起改亮。
 * 所以带 userData.env（金属 / 光滑）或 userData.glow（发光件）标记的材质都换成副本再改，
 * 原件始终保持白天、不挂贴图的样子；墙面等哑光材质不换，继续共用。
 */
export function createSceneMaterials(envMap: THREE.Texture | null): SceneMaterials {
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>(),
    own = new Set<THREE.Material>();
  let night = false;
  const tune = (copy: THREE.MeshStandardMaterial) => {
    if (copy.envMap) copy.envMapIntensity = copy.userData.env * nightLighting(night).env;
    if (copy.userData.glow) copy.emissiveIntensity = glowIntensity(copy.userData.glow, night);
  };
  const swap = (m: THREE.Material) => {
    if (own.has(m) || !(m instanceof THREE.MeshStandardMaterial)) return m;
    const reflective = !!envMap && !!m.userData.env;
    if (!reflective && !m.userData.glow) return m;
    let copy = copies.get(m);
    if (!copy) {
      copy = m.clone();
      if (reflective) copy.envMap = envMap;
      tune(copy);
      copies.set(m, copy);
      own.add(copy);
    }
    return copy;
  };
  return {
    adopt(root) {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
    },
    setNight(value) {
      night = value;
      copies.forEach(tune);
    },
    dispose() {
      copies.forEach((copy) => copy.dispose());
      copies.clear();
      own.clear();
    },
  };
}
