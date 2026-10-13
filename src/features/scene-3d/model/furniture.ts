import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Furniture } from "@/lib/floor-plan/types";
import type { ModelPart, ModelPartFinish } from "@/lib/floor-plan/furniture-3d";
import { furnitureRole, type FurnitureLook } from "@/lib/floor-plan/decor-styles";
import { hashSeed, rng } from "./random";

/** 颜色或现成材质；颜色走 mat() 缓存。 */
type Paint = string | THREE.Material;
type Vec3 = [number, number, number];

const hasMesh = (o: THREE.Object3D) => {
  let found = false;
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) found = true;
  });
  return found;
};
/**
 * 把一件家具的子网格按材质与投影设置合并，draw call 从几十个降到几个。
 * 拉手、叶片、岛台柜体这类嵌套小组一并拍平：按各自相对家具根节点的变换烘进顶点。
 */
function mergeParts(g: THREE.Group) {
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; parts: THREE.BufferGeometry[] }>();
  const ids = new Map<THREE.Material, number>();
  g.updateMatrixWorld(true);
  const toRoot = g.matrixWorld.clone().invert(),
    local = new THREE.Matrix4(),
    meshes: [THREE.Mesh, THREE.Material][] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) meshes.push([o, o.material]);
  });
  for (const [o, material] of meshes) {
    const source = o.geometry as THREE.BufferGeometry,
      geo = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    geo.clearGroups();
    geo.applyMatrix4(local.multiplyMatrices(toRoot, o.matrixWorld));
    if (!ids.has(material)) ids.set(material, ids.size);
    const key = ids.get(material) + ":" + o.castShadow;
    const bucket = buckets.get(key) || { material, cast: o.castShadow, parts: [] };
    bucket.parts.push(geo);
    buckets.set(key, bucket);
    o.removeFromParent();
  }
  // 拍平后只剩空壳的小组
  for (const o of [...g.children]) if (!(o instanceof THREE.Mesh) && !hasMesh(o)) g.remove(o);
  for (const { material, cast, parts } of buckets.values()) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) parts.forEach((p) => p.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

/** 玻璃、发光件、双面薄片等附加属性。 */
type Finish = Pick<THREE.MeshStandardMaterialParameters, "side" | "transparent" | "opacity" | "emissive" | "emissiveIntensity">;
const cache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * 共享材质缓存（Scene3D 的墙、门、吸顶灯也在用）。缓存里的原件所有渲染器共用，这里只打标记，
 * 由各场景的 createSceneMaterials 换成自己的副本再改：
 * - userData.env：金属 / 光滑表面（metalness > 0 或 roughness < 0.4）的反射强度，副本挂环境贴图；
 *   墙面等哑光材质不接反射，避免整体变亮。
 * - userData.glow：发光件白天的自发光强度，夜里副本调亮。
 */
export function mat(color: string, roughness = 0.7, metalness = 0, finish?: Finish) {
  const key = `${color}|${roughness}|${metalness}` + (finish ? "|" + JSON.stringify(finish) : "");
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...finish });
    if (metalness > 0 || roughness < 0.4) m.userData.env = metalness > 0.5 ? 1 : 0.5;
    if (finish?.emissive) m.userData.glow = m.emissiveIntensity;
    cache.set(key, m);
  }
  return m;
}
/** 淋浴房玻璃：与窗玻璃一样不接环境反射，所以不经过 mat()。 */
function glass() {
  let m = cache.get("glass");
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: "#c7e3ee", transparent: true, opacity: 0.23, roughness: 0.1, side: THREE.DoubleSide });
    cache.set("glass", m);
  }
  return m;
}
/** AI 模型部件的表面质感 → 粗糙度 / 金属度。 */
const FINISH: Record<ModelPartFinish, [number, number]> = { matte: [0.85, 0], gloss: [0.32, 0.05], metal: [0.35, 0.85] };

/** 释放缓存里的全部原件；各场景的副本由它们自己的 createSceneMaterials().dispose() 释放。 */
export function disposeMaterials() {
  cache.forEach((m) => m.dispose());
  cache.clear();
}

/** 线性空间按比例压暗 / 提亮，用来派生同色系的深浅。 */
const darker = (hex: string, k = 0.8) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();
const lighter = (hex: string, k = 0.2) => "#" + new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), k).getHexString();
/** 随机种子取家具 id 与尺寸：同一件家具挪了位置，书架上的书和花枝也不变。 */
const seedOf = (f: Furniture) => hashSeed(f.id, Math.round(f.w * 7 + f.d * 13));

/* ---------- 材质 ---------- */
const DOUBLE: Finish = { side: THREE.DoubleSide };
const fabric = (c: string) => mat(c, 0.96);
const woodMat = (c: string) => mat(c, 0.55);
const ceramic = (roughness = 0.12, finish?: Finish) => mat("#fbfbf9", roughness, 0, finish);
const chrome = () => mat("#eef0f2", 0.08, 1);
const steel = () => mat("#cfd2d4", 0.25, 0.9);
const blackMetal = () => mat("#2b2b2d", 0.4, 0.6);
const mirror = () => mat("#dfeaee", 0.06, 0.55);
/** 淋浴房型材，与窗框同色。 */
const profile = () => mat("#5d6166", 0.5, 0.4);
const screen = (glow = "#1a2636") => mat("#0b0e13", 0.1, 0.3, { emissive: glow, emissiveIntensity: 0.35 });
const glow = (c = "#fff4dc", e = "#ffdca0", k = 0.5) => mat(c, 0.9, 0, { emissive: e, emissiveIntensity: k, side: THREE.DoubleSide });
const led = (e: string, k: number) => mat("#101214", 0.7, 0, { emissive: e, emissiveIntensity: k });
/** 家电等不随风格变化的家具用的固定五金。 */
const fixedHardware = () => mat("#b9b3a8", 0.3, 0.85);
/** 风格五金：拉手、柜钮、龙头。 */
const hardware = (look: FurnitureLook) => mat(look.metal, look.roughness, look.metalness);
/** 金属腿：颜色取风格的深色收边，质感取风格五金。 */
const metalLegs = (look: FurnitureLook) => mat(look.legs, look.roughness, look.metalness);
/** 本来就是金属框的家具（书桌、电视柜腿、边几底座、吧椅）：木腿风格保留黑铁，金属腿风格换成风格金属。 */
const metalFrame = (look: FurnitureLook) => (look.legsKind === "metal" ? metalLegs(look) : blackMetal());
const BOOKS = ["#b88a6a", "#6f8f8a", "#d9c08c", "#9aa58c", "#a8675e", "#e6dccd", "#7d8ea3", "#c9bfae"];
const FLOWERS = ["#f3e6d8", "#e8b4a0", "#f6d27a", "#ffffff"];
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

/* ---------- 几何小工具：都挂到 g 上并返回网格，y 为底面高度（sphere / ring 为中心） ---------- */
/** 当前构建家具的圆角缩放（风格 softness），buildFurniture 开头设定；构建是同步的，不会串到下一件。 */
let roundness = 1;
const asMat = (m: Paint) => (typeof m === "string" ? mat(m) : m);
function mesh(g: THREE.Object3D, geometry: THREE.BufferGeometry, m: Paint, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geometry, asMat(m));
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function rot<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0) {
  o.rotation.set(x, y, z);
  return o;
}
/** 方块；round 是旧版小圆角（壁炉沿用）。 */
function box(g: THREE.Object3D, w: number, h: number, d: number, m: Paint, x = 0, y = 0, z = 0, round = false) {
  const geo = round
    ? new RoundedBoxGeometry(
        Math.max(0.01, w),
        Math.max(0.01, h),
        Math.max(0.01, d),
        2,
        Math.max(0.001, Math.min(0.04, w / 4, h / 4, d / 4)),
      )
    : new THREE.BoxGeometry(w, h, d);
  return mesh(g, geo, m, x, y + h / 2, z);
}
/** 圆角方块，圆角半径随风格 softness 缩放。 */
function rbox(g: THREE.Object3D, w: number, h: number, d: number, m: Paint, x = 0, y = 0, z = 0, r = 0.04) {
  const radius = Math.max(0.0005, Math.min(r * roundness, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return mesh(g, new RoundedBoxGeometry(w, h, d, 3, radius), m, x, y + h / 2, z);
}
/** 圆柱 / 圆台：rt 顶半径、rb 底半径。 */
function cylinder(g: THREE.Object3D, rt: number, rb: number, h: number, m: Paint, x = 0, y = 0, z = 0, seg = 24) {
  return mesh(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
}
/** 旋转体：pts = [[半径, 高度], …] 自下而上。 */
function lathe(g: THREE.Object3D, pts: [number, number][], m: Paint, x = 0, y = 0, z = 0, seg = 40) {
  return mesh(g, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg), m, x, y, z);
}
const UP = new THREE.Vector3(0, 1, 0);
/** 两点之间的圆杆，r0 在 a 端、r1 在 b 端（收分椅腿、斜撑）。 */
function rod(g: THREE.Object3D, a: Vec3, b: Vec3, r0: number, m: Paint, r1 = r0, seg = 12) {
  const A = new THREE.Vector3(...a),
    B = new THREE.Vector3(...b),
    o = mesh(g, new THREE.CylinderGeometry(r1, r0, Math.max(1e-4, A.distanceTo(B)), seg), m);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, B.sub(A).normalize());
  return o;
}
/** 沿曲线的圆管（水龙头、扶手、灯臂）。 */
function tube(g: THREE.Object3D, pts: Vec3[], r: number, m: Paint, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  return mesh(g, new THREE.TubeGeometry(curve, seg, r, 10), m);
}
/** 椭球（靠垫、叶片、豆袋），y 为中心。 */
function sphere(g: THREE.Object3D, rx: number, ry: number, rz: number, m: Paint, x = 0, y = 0, z = 0, seg = 24) {
  const o = mesh(g, new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m, x, y, z);
  o.scale.set(rx, ry, rz);
  return o;
}
/** 水平圆环，y 为中心。 */
function ring(g: THREE.Object3D, R: number, r: number, m: Paint, x = 0, y = 0, z = 0) {
  return rot(mesh(g, new THREE.TorusGeometry(R, r, 10, 48), m, x, y, z), Math.PI / 2);
}
function rrect(w: number, d: number, r: number) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -d / 2;
  r = Math.max(0, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** 中空圆角框（浴缸、水槽沿、椅背框）：外 w×d、壁厚 t、高 h。 */
function shell(g: THREE.Object3D, w: number, d: number, h: number, t: number, r: number, m: Paint, x = 0, y = 0, z = 0) {
  const s = rrect(w, d, r);
  s.holes.push(rrect(w - 2 * t, d - 2 * t, Math.max(0.004, r - t)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  return mesh(g, geo, m, x, y, z);
}
/** 一条腿：木腿按参考造型收分（底 r0、顶 r1），金属腿换成等粗的细杆。 */
function leg(g: THREE.Object3D, a: Vec3, b: Vec3, r0: number, r1: number, look: FurnitureLook, wood: Paint) {
  return look.legsKind === "metal" ? rod(g, a, b, r1 * 0.55, metalLegs(look)) : rod(g, a, b, r0, wood, r1);
}
/** 四条直腿：inset 为距边距离，r 为腿顶半径；wood 是木腿风格下用的材质。 */
function legs(g: THREE.Object3D, w: number, d: number, h: number, look: FurnitureLook, inset = 0.05, r = 0.02, wood: Paint = woodMat(look.legs)) {
  for (const [a, b] of CORNERS) {
    const x = a * (w / 2 - inset),
      z = b * (d / 2 - inset);
    leg(g, [x, 0, z], [x, h, z], r * 0.7, r, look, wood);
  }
}
/** 金属拉手：y 为拉手中心，z 为门板正面。 */
function pull(g: THREE.Object3D, len: number, vert: boolean, x: number, y: number, z: number, hw: Paint) {
  if (vert) box(g, 0.01, len, 0.01, hw, x, y - len / 2, z + 0.028);
  else box(g, len, 0.01, 0.01, hw, x, y - 0.005, z + 0.028);
  for (const s of [-1, 1])
    if (vert) box(g, 0.008, 0.008, 0.028, hw, x, y + s * (len / 2 - 0.015) - 0.004, z + 0.014);
    else box(g, 0.008, 0.008, 0.028, hw, x + s * (len / 2 - 0.015), y - 0.004, z + 0.014);
}
/** 圆钮：y 为中心，z 为门板正面。 */
function knob(g: THREE.Object3D, x: number, y: number, z: number, hw: Paint) {
  rot(cylinder(g, 0.011, 0.014, 0.02, hw, x, y - 0.01, z + 0.01, 16), Math.PI / 2);
  sphere(g, 0.014, 0.014, 0.008, hw, x, y, z + 0.022, 12);
}
/**
 * 柜门 / 抽屉面板：x0..x0+w、y0..y0+h 区域内 nx 列 × ny 行，正面朝 +z（z = 柜体正面）。
 * hd：bar 金属拉手 | knob 圆钮 | edge 顶部隐形拉槽 | none；hy：门拉手中心高度（缺省为面板中部）。
 */
function fronts(
  g: THREE.Object3D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  z: number,
  nx: number,
  ny: number,
  m: Paint,
  hw: Paint,
  hd: "bar" | "knob" | "edge" | "none" = "bar",
  hy?: number,
) {
  const gap = 0.005,
    pw = w / nx,
    ph = h / ny,
    fz = z + 0.018;
  box(g, w, h, 0.002, "#2a2724", x0 + w / 2, y0, z + 0.001); // 缝隙里透出的暗色
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const cx = x0 + pw * (i + 0.5),
        yb = y0 + ph * j,
        drawer = ph < 0.4 && pw >= ph;
      rbox(g, pw - gap, ph - gap, 0.018, m, cx, yb + gap / 2, z + 0.009, 0.003);
      if (hd === "none") continue;
      if (hd === "edge") {
        box(g, pw - 0.05, 0.01, 0.006, "#3c3a37", cx, yb + ph - gap - 0.018, fz);
        continue;
      }
      if (drawer) {
        if (hd === "knob") knob(g, cx, yb + ph / 2, fz, hw);
        else pull(g, Math.min(0.3, pw * 0.45), false, cx, yb + ph / 2, fz, hw);
        continue;
      }
      const len = Math.min(0.45, ph * 0.35),
        hx = nx === 1 ? cx + pw / 2 - 0.045 : i % 2 ? cx - pw / 2 + 0.04 : cx + pw / 2 - 0.04,
        y = Math.min(yb + ph - 0.05 - len / 2, Math.max(yb + 0.05 + len / 2, hy ?? yb + ph / 2));
      if (hd === "knob") knob(g, hx, y, fz, hw);
      else pull(g, len, true, hx, y, fz, hw);
    }
}
const vasePts = (r: number, h: number): [number, number][] => [[0, 0], [r * 0.65, 0], [r, h * 0.32], [r * 0.92, h * 0.62], [r * 0.42, h * 0.86], [r * 0.5, h]];
/** 花瓶，可插几枝花。 */
function vase(g: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, c: string, R: () => number, flowers = true) {
  lathe(g, vasePts(r, h), mat(c, 0.35, 0, DOUBLE), x, y, z, 32);
  if (!flowers) return;
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26 + R() * 0.4,
      s = 0.03 + R() * 0.05,
      top: Vec3 = [x + Math.cos(a) * s, y + h + 0.12 + R() * 0.14, z + Math.sin(a) * s];
    rod(g, [x, y + h * 0.6, z], top, 0.003, "#6f8f4a", 0.003, 6);
    sphere(g, 0.022, 0.018, 0.022, FLOWERS[k % 4], ...top, 12);
  }
}
/** 陶瓷台灯，灯罩微微发光。 */
function tableLamp(g: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  lathe(g, [[0, 0], [0.06 * s, 0], [0.075 * s, 0.05 * s], [0.08 * s, 0.12 * s], [0.055 * s, 0.2 * s], [0.018 * s, 0.25 * s], [0.012 * s, 0.3 * s]], ceramic(0.3), x, y, z, 32);
  lathe(g, [[0.13 * s, 0], [0.1 * s, 0.18 * s]], glow("#f6ecd9", "#ffdca0", 0.35), x, y + 0.26 * s, z, 40);
  sphere(g, 0.03 * s, 0.03 * s, 0.03 * s, glow("#fff", "#ffe2b0", 1), x, y + 0.31 * s, z, 12);
}
const plate = (g: THREE.Object3D, r: number, x: number, y: number, z: number) =>
  lathe(g, [[0, 0], [r * 0.6, 0], [r * 0.72, 0.008], [r, 0.02]], ceramic(0.12, DOUBLE), x, y, z, 32);
/**
 * AI 简易 3D 模型：按比例基本体拼装。部件尺寸与位置都是相对外框的比例
 * （x、z 为 -0.5~0.5 的中心，y 为 0~1 的底面，w / h / d 为占比），
 * 因此家具改尺寸时整套模型等比缩放。
 */
function buildParts(g: THREE.Group, parts: ModelPart[], w: number, h: number, d: number) {
  for (const p of parts) {
    const pw = Math.max(0.005, p.w * w), ph = Math.max(0.005, p.h * h), pd = Math.max(0.005, p.d * d);
    const [roughness, metalness] = FINISH[p.finish ?? "matte"];
    const material = mat(p.color, roughness, metalness);
    let geometry: THREE.BufferGeometry;
    if (p.kind === "cylinder") {
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      // 单位圆柱沿 y 轴：按轴向旋转后再缩放，圆截面拉成椭圆即贴合外框比例。
      if (p.axis === "x") geometry.rotateZ(Math.PI / 2);
      else if (p.axis === "z") geometry.rotateX(Math.PI / 2);
      geometry.scale(pw, ph, pd);
    } else if (p.kind === "sphere") {
      geometry = new THREE.SphereGeometry(1, 20, 14);
      geometry.scale(pw / 2, ph / 2, pd / 2);
    } else if (p.round) {
      geometry = new RoundedBoxGeometry(pw, ph, pd, 2, Math.max(0.001, Math.min(0.03, pw / 4, ph / 4, pd / 4)));
    } else {
      geometry = new THREE.BoxGeometry(pw, ph, pd);
    }
    const o = new THREE.Mesh(geometry, material);
    o.position.set(p.x * w, p.y * h + ph / 2, p.z * d);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
}

/**
 * 一件家具的 3D 模型（局部坐标：背面朝 -z）。配色由调用方按风格解析成 look 传入：
 * 有配色角色的家具用 look 的主色 / 木色 / 收边 / 点缀 / 五金 / 腿型 / 圆角；
 * 家电、洁具、电视、绿植、钢琴等没有角色的家具保持固有的样子，不随风格变化。
 */
export function buildFurniture(f: Furniture, look: FurnitureLook): THREE.Group {
  const g = new THREE.Group(),
    w = f.w / 1000,
    h = (f.height || 700) / 1000,
    d = f.d / 1000,
    c = look.main,
    bz = -d / 2,
    hw = hardware(look),
    R = rng(seedOf(f));
  roundness = furnitureRole(f.type) ? look.softness : 1;
  if (f.model3d?.parts.length) {
    buildParts(g, f.model3d.parts, w, h, d);
  } else if (f.type === "fireplace") {
    if (f.shape === "circle") cylinder(g, w / 2, w / 2, h, c);
    else box(g, w, h, d, c, 0, 0, 0, true);
    box(g, w * 0.45, h * 0.25, 0.012, "#252525", 0, h * 0.2, d / 2 + 0.007);
    const flue = Math.min(w, d) * 0.14;
    cylinder(g, flue, flue, h * 0.15, "#525252", 0, h, -d * 0.15);
  } else if (f.shape === "circle") {
    const body = cylinder(g, w / 2, w / 2, h, c);
    body.scale.z = d / w;
  } else if (f.shape === "rectangle") box(g, w, h, d, c);
  else
    switch (f.type) {
      case "bed": {
        const fr = woodMat(look.wood), fab = fabric(c), fh = 0.3, mt = 0.22, top = fh + mt,
          n = Math.max(3, Math.round(w / 0.28)), sw = (w - 0.04) / n;
        box(g, w - 0.12, 0.06, d - 0.14, look.legs, 0, 0, 0.03); // 内缩踢脚
        rbox(g, w, fh - 0.06, d - 0.08, fr, 0, 0.06, 0.04, 0.015); // 床箱
        rbox(g, w, 1.08, 0.06, fr, 0, 0, bz + 0.03, 0.012); // 床头板
        for (let i = 0; i < n; i++)
          rbox(g, sw - 0.006, 0.62, 0.06, fabric(darker(c, 0.8)), -w / 2 + 0.02 + sw * (i + 0.5), 0.42, bz + 0.08, 0.025); // 竖向软包
        const md = d - 0.13, dd = md * 0.66, dz = d / 2 - 0.015 - dd / 2;
        rbox(g, w - 0.06, mt, md, "#f6f3ee", 0, fh, bz + 0.11 + md / 2, 0.07); // 床垫
        rbox(g, w + 0.02, 0.27, dd, fab, 0, top - 0.2, dz, 0.04); // 被子
        rbox(g, w + 0.024, 0.06, 0.22, fabric("#fbfaf7"), 0, top + 0.025, dz - dd / 2 + 0.11, 0.025); // 翻边
        rbox(g, w + 0.05, 0.285, 0.42, fabric(darker(c, 0.62)), 0, top - 0.205, d / 2 - 0.35, 0.03); // 床尾巾
        const np = w >= 1.3 ? 2 : 1, pw = (w - 0.16 - (np - 1) * 0.06) / np;
        for (let i = 0; i < np; i++) {
          const x = -w / 2 + 0.08 + pw / 2 + i * (pw + 0.06);
          rot(rbox(g, pw, 0.15, 0.42, fabric("#ffffff"), x, top - 0.01, bz + 0.34, 0.07), -0.28); // 睡枕
          rot(rbox(g, pw * 0.62, 0.3, 0.1, fabric(i ? look.accent : darker(c, 0.7)), x, top, bz + 0.54, 0.045), -0.3); // 靠枕
        }
        break;
      }
      case "sofa":
      case "armchair": {
        const fab = fabric(c), dk = fabric(darker(c, 0.88)), a = Math.min(0.18, w * 0.14),
          n = f.type === "armchair" ? 1 : w > 2.2 ? 3 : 2, cw = (w - 2 * a) / n,
          bd = Math.min(0.2, d * 0.24), lh = 0.12, sd = d - bd - 0.02;
        legs(g, w, d, lh, look, 0.07, 0.018);
        rbox(g, w, 0.16, d, dk, 0, lh, 0, 0.03); // 底座
        rbox(g, w, 0.73, bd, dk, 0, lh, bz + bd / 2, 0.06); // 靠背
        for (const s of [-1, 1]) rbox(g, a, 0.5, d, dk, s * (w / 2 - a / 2), lh, 0, 0.07); // 扶手
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + a + cw / 2 + i * cw;
          rbox(g, cw - 0.012, 0.15, sd, fab, x, lh + 0.16, bz + bd + sd / 2, 0.055); // 坐垫
          rot(rbox(g, cw - 0.03, 0.44, 0.16, fab, x, lh + 0.3, bz + bd + 0.08, 0.07), -0.16); // 靠垫
        }
        if (n > 1)
          for (const s of [-1, 1])
            rot(rbox(g, 0.42, 0.42, 0.12, fabric(s < 0 ? look.accent : darker(c, 0.7)), s * (w / 2 - a - 0.26), lh + 0.32, bz + bd + 0.22, 0.06), -0.3, s * -0.25); // 抱枕
        else rot(rbox(g, 0.4, 0.26, 0.1, fabric(look.accent), 0, lh + 0.33, bz + bd + 0.2, 0.05), -0.25);
        break;
      }
      case "cornersofa": {
        const k = Math.min(0.95, d * 0.56, w * 0.4), b = 0.2, fab = fabric(c), dk = fabric(darker(c, 0.88)),
          lh = 0.1, sw = (w - b - 0.2) / 2, lw = woodMat(look.legs);
        for (const [x, z] of [[-w / 2 + 0.07, bz + 0.07], [w / 2 - 0.07, bz + 0.07], [w / 2 - 0.07, bz + k - 0.07], [-w / 2 + 0.07, d / 2 - 0.07], [-w / 2 + k - 0.07, d / 2 - 0.07], [-w / 2 + k - 0.07, bz + k - 0.07]])
          leg(g, [x, 0, z], [x, lh, z], 0.012, 0.018, look, lw);
        rbox(g, w, 0.18, k, dk, 0, lh, bz + k / 2, 0.03); // 底座
        rbox(g, k, 0.18, d - k + 0.02, dk, -w / 2 + k / 2, lh, bz + k + (d - k) / 2 - 0.01, 0.03);
        rbox(g, w, 0.72, b, dk, 0, lh, bz + b / 2, 0.06); // 靠背
        rbox(g, b, 0.72, d, dk, -w / 2 + b / 2, lh, 0, 0.06);
        rbox(g, 0.2, 0.5, k, dk, w / 2 - 0.1, lh, bz + k / 2, 0.07); // 扶手
        rbox(g, k, 0.5, 0.2, dk, -w / 2 + k / 2, lh, d / 2 - 0.1, 0.07);
        for (let i = 0; i < 2; i++) {
          const x = -w / 2 + b + sw / 2 + i * sw;
          rbox(g, sw - 0.012, 0.15, k - b - 0.02, fab, x, lh + 0.18, bz + b + (k - b) / 2, 0.055);
          rot(rbox(g, sw - 0.04, 0.42, 0.16, fab, x, lh + 0.3, bz + b + 0.07, 0.07), -0.16);
        }
        rbox(g, k - b - 0.02, 0.15, d - k - 0.22, fab, -w / 2 + b + (k - b) / 2, lh + 0.18, bz + k + (d - k - 0.2) / 2, 0.055); // 贵妃位
        const L = d - 0.2 - b - 0.18, nl = Math.max(1, Math.round(L / 0.75));
        for (let i = 0; i < nl; i++)
          rot(rbox(g, 0.16, 0.42, L / nl - 0.03, fab, -w / 2 + b + 0.07, lh + 0.3, bz + b + 0.18 + (L / nl) * (i + 0.5), 0.07), 0, 0, 0.16);
        rot(rbox(g, 0.42, 0.42, 0.12, fabric(look.accent), -w / 2 + b + 0.3, lh + 0.34, bz + b + 0.24, 0.06), -0.35, 0.6); // 抱枕
        rot(rbox(g, 0.4, 0.4, 0.12, fabric(darker(c, 0.7)), w / 2 - 0.5, lh + 0.34, bz + b + 0.2, 0.06), -0.3, -0.25);
        break;
      }
      case "nightstand": {
        const wm = woodMat(c);
        legs(g, w, d, 0.1, look, 0.04, 0.014, woodMat(darker(look.wood, 0.4)));
        rbox(g, w, 0.4, d - 0.02, wm, 0, 0.1, -0.01, 0.012);
        fronts(g, -w / 2 + 0.02, 0.12, w - 0.04, 0.36, d / 2 - 0.02, 1, 2, wm, hw);
        tableLamp(g, -w * 0.12, 0.5, -d * 0.12);
        box(g, 0.16, 0.025, 0.22, "#2f5d62", w * 0.24, 0.5, 0.04); // 书
        box(g, 0.14, 0.02, 0.2, "#e6dccd", w * 0.24, 0.525, 0.04);
        break;
      }
      case "wardrobe":
      case "cabinet":
      case "shoecab": {
        const cm = mat(c, 0.55), fz = d / 2 - 0.02;
        if (f.type === "wardrobe") {
          const h = 2.2, n = Math.max(1, Math.round(w / 0.5));
          box(g, w - 0.02, 0.08, d - 0.06, look.legs, 0, 0, -0.03); // 踢脚
          box(g, w, h - 0.08, d - 0.02, cm, 0, 0.08, -0.01);
          fronts(g, -w / 2, 0.08, w, h - 0.1, fz, n, 1, cm, hw, "bar", 1.05);
          box(g, w, 0.02, d - 0.02, darker(c, 0.9), 0, h - 0.02, -0.01); // 顶线
        } else if (f.type === "shoecab") {
          const h = 1.0, y0 = 0.16, n = Math.max(1, Math.round(w / 0.45));
          box(g, w, h - y0, d - 0.02, cm, 0, y0, -0.01); // 悬空柜体
          box(g, w - 0.04, 0.01, 0.03, glow("#fff7e6", "#ffe9c4", 0.8), 0, y0 - 0.01, fz - 0.06); // 底部灯带
          fronts(g, -w / 2, y0, w, h - y0, fz, n, 1, cm, hw, "edge");
          rbox(g, w + 0.01, 0.025, d, woodMat(darker(c, 0.8)), 0, h, 0, 0.006); // 台面
          rbox(g, 0.22, 0.015, 0.14, woodMat(darker(look.wood, 0.53)), -w * 0.25, h + 0.025, 0, 0.006); // 钥匙托盘
          vase(g, w * 0.28, h + 0.025, -0.03, 0.05, 0.2, "#d8cfc2", R);
        } else {
          const h = 0.85, n = Math.max(1, Math.round(w / 0.5));
          legs(g, w, d, 0.1, look, 0.05, 0.016);
          box(g, w, h - 0.13, d - 0.02, cm, 0, 0.1, -0.01);
          fronts(g, -w / 2, 0.62, w, 0.2, fz, n, 1, cm, hw);
          fronts(g, -w / 2, 0.1, w, 0.52, fz, n, 1, cm, hw, "bar", 0.52);
          rbox(g, w + 0.02, 0.03, d + 0.01, woodMat(darker(c, 0.78)), 0, h - 0.03, 0, 0.008); // 台面
          vase(g, w * 0.3, h, 0, 0.07, 0.24, "#e9e2d6", R);
          rot(box(g, 0.3, 0.38, 0.02, woodMat(look.legs), -w * 0.25, h, bz + 0.06), -0.12); // 靠墙画框
          rot(box(g, 0.25, 0.33, 0.005, "#d9cfbf", -w * 0.25, h + 0.03, bz + 0.075), -0.12);
          lathe(g, [[0, 0], [0.05, 0], [0.12, 0.06], [0.13, 0.07]], mat("#b8a58c", 0.5, 0, DOUBLE), 0, h, 0.02, 32); // 果盘
          ["#d98c4a", "#c9ad4f", "#b5463a"].forEach((fc, k) =>
            sphere(g, 0.035, 0.035, 0.035, fc, Math.cos(k * 2.1) * 0.04, h + 0.045, 0.02 + Math.sin(k * 2.1) * 0.04, 14),
          );
        }
        break;
      }
      case "dresser": {
        const wm = woodMat(c), dark = woodMat(darker(c, 0.7)), r = Math.min(0.34, w * 0.3);
        for (const [a, b] of CORNERS)
          leg(g, [a * (w / 2 - 0.04), 0, b * (d / 2 - 0.04)], [a * (w / 2 - 0.05), 0.58, b * (d / 2 - 0.05)], 0.012, 0.02, look, wm);
        box(g, w - 0.04, 0.14, d - 0.04, wm, 0, 0.58);
        rbox(g, w, 0.03, d, wm, 0, 0.72, 0, 0.008);
        fronts(g, -w / 2 + 0.03, 0.585, w - 0.06, 0.13, d / 2 - 0.02, 2, 1, wm, hw, "knob");
        mesh(g, new THREE.TorusGeometry(r, 0.018, 12, 64), dark, 0, 0.77 + r, bz + 0.04); // 圆镜框
        mesh(g, new THREE.CircleGeometry(r, 64), mirror(), 0, 0.77 + r, bz + 0.035).castShadow = false;
        box(g, 0.08, 0.03, 0.06, dark, 0, 0.75, bz + 0.04);
        ([["#e7c9b5", 0.03, 0.09], ["#b9d0d8", 0.025, 0.12], ["#f0e3cf", 0.02, 0.07]] as const).forEach(([bc, br, bh], i) =>
          cylinder(g, br, br, bh, mat(bc, 0.15, 0, { transparent: true, opacity: 0.8 }), w * 0.25 + i * 0.06, 0.75, 0.02, 28),
        ); // 瓶罐
        rbox(g, 0.16, 0.06, 0.1, woodMat(darker(look.wood, 0.53)), -w * 0.28, 0.75, 0.03, 0.01); // 首饰盒
        const sz = d / 2 + 0.25;
        for (const [a, b] of CORNERS) leg(g, [a * 0.13, 0, sz + b * 0.13], [a * 0.12, 0.4, sz + b * 0.12], 0.01, 0.014, look, wm); // 梳妆凳
        rbox(g, 0.34, 0.08, 0.34, fabric(look.accent), 0, 0.4, sz, 0.035);
        break;
      }
      case "desk": {
        const tm = woodMat(c), fm = metalFrame(look), bm = blackMetal();
        rbox(g, w, 0.025, d, tm, 0, 0.72, 0, 0.006);
        for (const s of [-1, 1]) {
          const x = s * (w / 2 - 0.06);
          box(g, 0.03, 0.72, 0.03, fm, x, 0, d / 2 - 0.06);
          box(g, 0.03, 0.72, 0.03, fm, x, 0, bz + 0.06);
          box(g, 0.03, 0.03, d - 0.1, fm, x, 0, 0);
          box(g, 0.03, 0.03, d - 0.1, fm, x, 0.69, 0);
        }
        box(g, w - 0.12, 0.04, 0.015, fm, 0, 0.66, bz + 0.06);
        box(g, 0.4, 0.09, d - 0.12, tm, w / 2 - 0.32, 0.63, 0); // 抽屉
        pull(g, 0.16, false, w / 2 - 0.32, 0.675, d / 2 - 0.06, hw);
        const my = 0.745, mz = bz + 0.15;
        rbox(g, 0.22, 0.012, 0.16, bm, 0, my, mz, 0.004); // 显示器
        rod(g, [0, my, mz - 0.02], [0, my + 0.2, mz - 0.03], 0.012, bm);
        rbox(g, 0.62, 0.37, 0.02, "#1d1d1f", 0, my + 0.12, mz - 0.04, 0.006);
        box(g, 0.6, 0.33, 0.002, screen("#27405c"), 0, my + 0.15, mz - 0.029);
        rbox(g, 0.42, 0.015, 0.13, "#e8e8ea", 0, my, 0.06, 0.004); // 键盘
        rbox(g, 0.4, 0.004, 0.11, "#d2d2d6", 0, my + 0.014, 0.06, 0.002);
        sphere(g, 0.03, 0.015, 0.05, "#e8e8ea", 0.3, my + 0.012, 0.07, 16); // 鼠标
        const lx = -w / 2 + 0.15, lz = bz + 0.12;
        cylinder(g, 0.07, 0.075, 0.02, fm, lx, my, lz, 28); // 台灯
        tube(g, [[lx, my + 0.02, lz], [lx, my + 0.3, lz + 0.03], [lx + 0.12, my + 0.42, lz + 0.1]], 0.008, fm);
        cylinder(g, 0.02, 0.06, 0.1, fm, lx + 0.14, my + 0.34, lz + 0.12, 24).rotation.x = 0.5;
        cylinder(g, 0.04, 0.038, 0.09, ceramic(0.3), w / 2 - 0.15, my, 0.05, 20); // 杯子
        rbox(g, 0.2, 0.015, 0.28, "#3b5566", -w / 2 + 0.3, my, 0.1, 0.004); // 笔记本
        break;
      }
      case "chair": {
        const lw = woodMat(darker(look.wood, 0.53)), lm = look.legsKind === "metal" ? metalLegs(look) : lw, fab = fabric(c), sy = 0.44;
        for (const s of [-1, 1]) leg(g, [s * (w / 2 - 0.04), 0, d / 2 - 0.05], [s * (w / 2 - 0.05), sy, d / 2 - 0.07], 0.012, 0.018, look, lw); // 前腿
        for (const s of [-1, 1]) leg(g, [s * (w / 2 - 0.04), 0, bz + 0.03], [s * (w / 2 - 0.05), 0.86, bz + 0.07], 0.012, 0.018, look, lw); // 后腿兼靠背立柱
        box(g, w - 0.08, 0.025, 0.02, lm, 0, 0.15, d / 2 - 0.06); // 横撑
        box(g, w - 0.08, 0.025, 0.02, lm, 0, 0.15, bz + 0.05);
        for (const s of [-1, 1]) box(g, 0.02, 0.025, d - 0.12, lm, s * (w / 2 - 0.045), 0.18, 0);
        box(g, w - 0.06, 0.04, d - 0.1, lw, 0, sy - 0.03, 0); // 座板
        rbox(g, w - 0.04, 0.05, d - 0.08, fab, 0, sy, 0.005, 0.022); // 坐垫
        rot(rbox(g, w - 0.08, 0.15, 0.025, lw, 0, 0.66, bz + 0.065, 0.012), -0.12); // 靠背
        rot(box(g, w - 0.08, 0.025, 0.02, lw, 0, 0.52, bz + 0.055), -0.12);
        break;
      }
      case "officechair": {
        const r = Math.min(w, d) * 0.46, dk = darker(c, 0.75), bm = mat("#2b2b2d", 0.45), cm = chrome();
        for (let k = 0; k < 5; k++) {
          const a = (k * Math.PI * 2) / 5, tx = Math.sin(a) * r * 0.95, tz = Math.cos(a) * r * 0.95;
          rod(g, [0, 0.1, 0], [tx, 0.07, tz], 0.022, bm, 0.014, 10); // 五星脚
          cylinder(g, 0.008, 0.008, 0.03, bm, tx, 0.04, tz, 8);
          rot(cylinder(g, 0.026, 0.026, 0.03, "#111", tx, 0.026 - 0.015, tz, 16), 0, a, Math.PI / 2); // 脚轮
        }
        cylinder(g, 0.05, 0.06, 0.05, bm, 0, 0.08, 0, 20);
        cylinder(g, 0.025, 0.025, 0.22, cm, 0, 0.12, 0, 16); // 气杆
        cylinder(g, 0.036, 0.036, 0.12, bm, 0, 0.12, 0, 16);
        rbox(g, 0.22, 0.05, 0.22, bm, 0, 0.34, 0.02, 0.01);
        rbox(g, w * 0.78, 0.03, d * 0.72, bm, 0, 0.38, 0.04, 0.01);
        rbox(g, w * 0.8, 0.08, d * 0.74, fabric(c), 0, 0.4, 0.05, 0.035); // 坐垫
        tube(g, [[0, 0.36, 0], [0, 0.38, bz + 0.12], [0, 0.6, bz + 0.07]], 0.02, bm);
        const frame = shell(g, w * 0.72, 0.6, 0.03, 0.025, 0.08, bm); // 靠背框
        frame.rotation.x = Math.PI / 2 - 0.12;
        frame.position.set(0, 0.88, bz + 0.06);
        rot(box(g, w * 0.68, 0.56, 0.006, mat(dk, 0.85, 0, { transparent: true, opacity: 0.88, side: THREE.DoubleSide }), 0, 0.6, bz + 0.085), -0.12); // 网布
        rot(rbox(g, w * 0.5, 0.08, 0.03, fabric(c), 0, 0.66, bz + 0.11, 0.015), -0.12); // 腰托
        rod(g, [-0.05, 1.14, bz + 0.025], [-0.05, 1.22, bz + 0.015], 0.008, bm);
        rod(g, [0.05, 1.14, bz + 0.025], [0.05, 1.22, bz + 0.015], 0.008, bm);
        rbox(g, w * 0.45, 0.12, 0.05, fabric(dk), 0, 1.2, bz + 0.02, 0.025); // 头枕
        for (const s of [-1, 1]) {
          box(g, 0.035, 0.22, 0.035, bm, s * w * 0.4, 0.42, 0.04); // 扶手
          rbox(g, 0.07, 0.03, d * 0.4, bm, s * w * 0.4, 0.63, 0.04, 0.012);
        }
        break;
      }
      case "bookshelf": {
        const h = 1.8, t = 0.022, ns = 5, wm = woodMat(c), sh0 = (h - 0.06 - t) / ns;
        box(g, w, h, 0.012, woodMat(darker(c, 0.85)), 0, 0, bz + 0.006); // 背板
        box(g, t, h, d, wm, -w / 2 + t / 2);
        box(g, t, h, d, wm, w / 2 - t / 2);
        box(g, w - 2 * t, 0.06, d - 0.03, wm, 0, 0, 0); // 底座
        for (let s = 0; s <= ns; s++) {
          const y = s < ns ? 0.06 + s * sh0 : h - t;
          box(g, w - 2 * t, t, d - 0.012, wm, 0, y, 0.006); // 层板
          if (s === ns) break;
          const yb = y + t, end = w / 2 - t - 0.01;
          let x = -w / 2 + t + 0.01, deco = R() < 0.55 ? x + R() * (w - 0.45) : 99;
          while (x < end - 0.03) {
            if (x >= deco) {
              // 每层最多一处摆件：小花瓶或平放的一摞书
              deco = 99;
              if (R() < 0.5) vase(g, x + 0.07, yb, 0, 0.045, 0.16, BOOKS[Math.floor(R() * 8)], R, false);
              else for (let k = 0; k < 3; k++) box(g, 0.2 - k * 0.02, 0.028, d * 0.7, mat(BOOKS[Math.floor(R() * 8)], 0.8), x + 0.1, yb + k * 0.028, 0.01);
              x += 0.2;
              continue;
            }
            if (R() < 0.07) {
              x += 0.03 + R() * 0.05;
              continue;
            }
            const bw = 0.018 + R() * 0.03, bh = Math.min(sh0 - t - 0.03, 0.17 + R() * 0.13), bd = d * (0.62 + R() * 0.22);
            if (x + bw > end) break;
            box(g, bw, bh, bd, mat(BOOKS[Math.floor(R() * 8)], 0.75), x + bw / 2, yb, d / 2 - 0.015 - bd / 2);
            x += bw + 0.002;
          }
        }
        break;
      }
      case "baycushion":
        rbox(g, w, 0.08, d, fabric(c), 0, 0.45, 0, 0.03);
        rot(rbox(g, w - 0.1, 0.34, 0.14, fabric("#ffffff"), 0, 0.52, bz + 0.14, 0.06), 0.25); // 两端靠垫
        rot(rbox(g, w - 0.1, 0.34, 0.14, fabric(look.accent), 0, 0.52, d / 2 - 0.14, 0.06), -0.25);
        rbox(g, w * 0.8, 0.04, 0.3, fabric(darker(c, 0.7)), 0, 0.53, d * 0.12, 0.02); // 搭毯
        rbox(g, 0.28, 0.015, 0.2, woodMat(look.wood), 0, 0.53, -d * 0.15, 0.006); // 托盘
        cylinder(g, 0.035, 0.03, 0.06, ceramic(), 0, 0.545, -d * 0.15, 20);
        break;
      case "coffeetable": {
        const tm = mat(c, 0.35), lw = woodMat(look.legs);
        for (const [a, b] of CORNERS)
          leg(g, [a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05)], [a * (w / 2 - 0.07), 0.365, b * (d / 2 - 0.07)], 0.012, 0.02, look, lw);
        rbox(g, w, 0.035, d, tm, 0, 0.365, 0, 0.015);
        rbox(g, w - 0.12, 0.02, d - 0.12, woodMat(darker(c, 0.85)), 0, 0.12, 0, 0.006); // 下层板
        box(g, 0.3, 0.03, 0.22, "#2f5d62", w * 0.2, 0.14, 0); // 书
        box(g, 0.26, 0.025, 0.19, "#d9b36c", w * 0.2, 0.17, 0.01);
        rbox(g, 0.38, 0.015, 0.24, woodMat(darker(look.wood, 0.53)), -w * 0.2, 0.4, 0, 0.006); // 托盘
        box(g, 0.22, 0.025, 0.16, "#e6dccd", -w * 0.22, 0.415, 0);
        lathe(g, [[0, 0], [0.025, 0], [0.035, 0.07], [0.034, 0.08]], ceramic(0.12, DOUBLE), -w * 0.12, 0.415, 0.06, 20); // 杯子
        vase(g, w * 0.24, 0.4, -0.05, 0.055, 0.18, "#e9e2d6", R);
        break;
      }
      case "tvstand": {
        const sm = mat(c, 0.5), n = Math.max(2, Math.round(w / 0.6));
        legs(g, w, d, 0.1, look, 0.08, 0.012, blackMetal());
        rbox(g, w, 0.4, d - 0.02, sm, 0, 0.1, -0.01, 0.01);
        fronts(g, -w / 2 + 0.005, 0.105, w - 0.01, 0.39, d / 2 - 0.02, n, 1, sm, hw, "edge");
        rbox(g, 1.45, 0.84, 0.025, mat("#18181a", 0.4, 0.3), 0, 0.95, bz + 0.03, 0.004); // 电视
        box(g, 1.43, 0.81, 0.002, screen(), 0, 0.962, bz + 0.0435);
        rbox(g, 0.9, 0.06, 0.09, "#2a2a2c", 0, 0.5, -0.02, 0.02); // 回音壁
        box(g, 0.86, 0.045, 0.002, fabric("#3a3a3c"), 0, 0.507, 0.026);
        vase(g, w / 2 - 0.25, 0.5, 0, 0.06, 0.26, "#d8cfc2", R);
        box(g, 0.25, 0.035, 0.18, "#a9433b", -w / 2 + 0.3, 0.5, 0); // 书
        box(g, 0.22, 0.03, 0.16, "#e6dccd", -w / 2 + 0.3, 0.535, 0);
        break;
      }
      case "rug":
        for (const [rw, rd, rh, rc, ry] of [
          [w, d, 0.01, c, 0],
          [w - 0.16, d - 0.16, 0.002, darker(c, 0.82), 0.01],
          [w - 0.26, d - 0.26, 0.002, lighter(c, 0.12), 0.0115],
        ] as const)
          box(g, rw, rh, rd, mat(rc, 1), 0, ry + 0.002).castShadow = false; // 底毯 + 深色边 + 浅色心
        break;
      case "plant": {
        const r = Math.min(w, d) / 2, H = 0.9 + r * 1.6, pot = mat("#d9d2c5", 0.6),
          leaves = [mat("#5f8f4e", 0.6, 0, DOUBLE), mat("#79a862", 0.6, 0, DOUBLE)];
        lathe(g, [[0, 0], [r * 0.4, 0], [r * 0.44, 0.02], [r * 0.54, 0.36], [r * 0.57, 0.4], [r * 0.52, 0.4], [r * 0.5, 0.37], [0, 0.37]], pot, 0, 0, 0, 36); // 花盆
        cylinder(g, r * 0.49, r * 0.49, 0.005, "#4a3a2c", 0, 0.368, 0, 28); // 盆土
        rod(g, [0, 0.37, 0], [0.02, H * 0.62, -0.01], 0.016, "#6b5540", 0.009); // 主干
        const N = 20 + Math.round(r * 36), sc = Math.sqrt(r / 0.25);
        for (let k = 0; k < N; k++) {
          // 叶片绕主干按黄金角螺旋排布，越往上越短越翘
          const t = k / N, a = k * 2.399 + R() * 0.3, len = (0.14 + R() * 0.08) * (1.1 - t * 0.4) * sc,
            s0 = 0.03 + R() * 0.08 * sc, p = new THREE.Group();
          p.position.set(0, H * (0.42 + 0.58 * t), 0);
          p.rotation.set(0, -a, 0.1 + t * 0.5 + R() * 0.3, "YXZ");
          box(p, s0, 0.005, 0.005, "#6f8f4a", s0 / 2, 0, 0); // 叶柄
          sphere(p, len / 2, 0.005, len * 0.27, leaves[k % 2], s0 + len / 2, 0, 0, 16).rotation.z = -0.3;
          g.add(p);
        }
        break;
      }
      case "table": {
        const tm = mat(c, 0.4), lw = woodMat(darker(c, 0.55)), lm = look.legsKind === "metal" ? metalLegs(look) : lw,
          ns = Math.max(1, Math.round(w / 0.62)), top = 0.75;
        for (const [a, b] of CORNERS)
          leg(g, [a * (w / 2 - 0.08), 0, b * (d / 2 - 0.08)], [a * (w / 2 - 0.1), 0.715, b * (d / 2 - 0.1)], 0.016, 0.026, look, lw);
        rbox(g, w, 0.035, d, tm, 0, 0.715, 0, 0.012);
        box(g, w - 0.22, 0.07, d - 0.22, lm, 0, 0.645); // 牙板
        box(g, w * 0.7, 0.003, 0.32, fabric(darker(look.accent, 0.5)), 0, top, 0); // 桌旗
        for (let i = 0; i < ns; i++)
          for (const s of [-1, 1]) {
            const x = -w / 2 + (w / ns) * (i + 0.5), z = s * (d / 2 - 0.17);
            box(g, 0.38, 0.003, 0.28, fabric("#e7dfd1"), x, top, z); // 餐垫
            plate(g, 0.12, x, top + 0.003, z);
            cylinder(g, 0.03, 0.026, 0.1, mat("#dfeef3", 0.05, 0, { transparent: true, opacity: 0.35 }), x + 0.15, top + 0.003, z - s * 0.1, 16); // 水杯
          }
        vase(g, 0, top + 0.003, 0, 0.06, 0.2, "#e9e2d6", R);
        break;
      }
      case "roundtable": {
        const b = Math.min(0.25, w * 0.3), top = 0.75,
          base = look.legsKind === "metal" ? metalLegs(look) : woodMat(darker(look.wood, 0.28));
        lathe(g, [[b, 0], [b, 0.015], [b * 0.8, 0.035], [0.06, 0.12], [0.045, 0.35], [0.05, 0.6], [0.12, 0.69], [0.18, 0.715]], base, 0, 0, 0, 40); // 中柱底座
        cylinder(g, w / 2, w / 2, 0.035, mat(c, 0.4), 0, 0.715, 0, 64);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + 0.4, rr = w / 2 - 0.17;
          plate(g, 0.11, Math.cos(a) * rr, top, Math.sin(a) * rr);
        }
        vase(g, 0, top, 0, 0.05, 0.18, "#e9e2d6", R);
        break;
      }
      case "counter": {
        const cm = mat(c, 0.45), stone = mat("#dcd7cf", 0.22), n = Math.max(1, Math.round(w / 0.6)), fz = d / 2 - 0.04;
        box(g, w - 0.01, 0.1, d - 0.1, look.legs, 0, 0, -0.05); // 踢脚
        box(g, w, 0.72, d - 0.04, cm, 0, 0.1, -0.02);
        fronts(g, -w / 2, 0.64, w, 0.18, fz, n, 1, cm, hw);
        fronts(g, -w / 2, 0.1, w, 0.54, fz, n, 1, cm, hw, "bar", 0.56);
        rbox(g, w + 0.01, 0.04, d, stone, 0, 0.82, 0, 0.004); // 石材台面
        box(g, w, 0.62, 0.01, mat("#efece6", 0.3), 0, 0.86, bz + 0.005); // 挡水墙
        box(g, w, 0.7, 0.33, cm, 0, 1.48, bz + 0.165); // 吊柜
        fronts(g, -w / 2, 1.48, w, 0.7, bz + 0.33, n, 1, cm, hw, "bar", 1.56);
        box(g, w - 0.04, 0.01, 0.02, glow("#fff7e6", "#ffe9c4", 0.8), 0, 1.47, bz + 0.29); // 吊柜灯带
        if (w >= 0.8) {
          rbox(g, 0.36, 0.018, 0.25, woodMat("#c9a27a"), -w / 2 + 0.3, 0.86, 0, 0.005); // 砧板
          [0.07, 0.06, 0.05].forEach((jr, i) =>
            cylinder(g, jr, jr, 0.16 - i * 0.03, mat(["#e9e2d6", "#d6cfc3", "#bfb6a8"][i], 0.4), w / 2 - 0.15 - i * 0.15, 0.86, bz + 0.1, 24),
          ); // 调料罐
          cylinder(g, 0.05, 0.045, 0.14, ceramic(0.3), w / 2 - 0.6, 0.86, bz + 0.1, 20); // 厨具筒
          for (let k = 0; k < 4; k++)
            rod(g, [w / 2 - 0.6, 0.9, bz + 0.1], [w / 2 - 0.6 + (k - 1.5) * 0.018, 1.1, bz + 0.1 + ((k % 2) - 0.5) * 0.02], 0.005, woodMat(look.wood), 0.006, 6);
        }
        break;
      }
      case "stove": {
        const sm = mat("#b9bec3", 0.3, 0.8);
        rbox(g, w, 0.012, d, mat("#0d0d0e", 0.06, 0.3), 0, 0.862, 0, 0.004); // 玻璃面板
        for (const [x, z] of w / d > 1.4 ? [[-w / 4, 0], [w / 4, 0]] : [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) {
          cylinder(g, 0.085, 0.09, 0.008, "#2b2b2b", x, 0.874, z, 32); // 炉头
          cylinder(g, 0.045, 0.05, 0.014, mat("#6b5a45", 0.35, 0.7), x, 0.874, z, 28);
          cylinder(g, 0.028, 0.028, 0.022, "#1a1a1a", x, 0.874, z, 20);
          for (let k = 0; k < 5; k++) {
            const a = (k * Math.PI * 2) / 5;
            rot(box(g, 0.07, 0.014, 0.012, "#1c1c1c", x + Math.cos(a) * 0.1, 0.874, z + Math.sin(a) * 0.1), 0, -a); // 锅架
          }
          cylinder(g, 0.02, 0.022, 0.018, "#222", x, 0.874, d / 2 - 0.04, 20); // 旋钮
        }
        rbox(g, w, 0.06, 0.5, sm, 0, 1.55, bz + 0.25, 0.01); // 烟机
        box(g, 0.3, 0.72, 0.26, sm, 0, 1.61, bz + 0.13);
        rot(box(g, w - 0.02, 0.3, 0.008, mat("#15181b", 0.05, 0.5), 0, 1.58, bz + 0.38), -0.9);
        box(g, 0.16, 0.012, 0.003, led("#6fd0ff", 0.6), 0, 1.575, bz + 0.502);
        break;
      }
      case "ksink": {
        const st = mat("#c7ccd1", 0.28, 0.85), inner = mat("#9aa1a8", 0.35, 0.8), cm = chrome(),
          two = w >= 0.75, bw = two ? w * 0.42 : w * 0.7, bd = d * 0.66, fx = two ? 0 : w * 0.3;
        box(g, w, 0.008, d, st, 0, 0.862, 0);
        for (const x of two ? [-w * 0.23, w * 0.23] : [0]) {
          shell(g, bw, bd, 0.02, 0.015, 0.04, st, x, 0.862, 0.03); // 盆沿
          box(g, bw - 0.03, 0.002, bd - 0.03, inner, x, 0.87, 0.03);
          cylinder(g, 0.03, 0.03, 0.003, cm, x, 0.872, 0.03, 20); // 下水口
        }
        cylinder(g, 0.025, 0.028, 0.03, cm, fx, 0.87, bz + 0.06, 20); // 龙头
        tube(g, [[fx, 0.9, bz + 0.06], [fx, 1.12, bz + 0.06], [fx, 1.17, bz + 0.1], [fx, 1.14, bz + 0.18], [fx, 1.08, bz + 0.2]], 0.012, cm);
        rot(box(g, 0.012, 0.012, 0.09, cm, fx + 0.035, 0.98, bz + 0.09), -0.3);
        break;
      }
      case "fridge": {
        const fm = mat(c, 0.28, 0.45), h = 1.8, fz = d / 2 - 0.05, hwf = fixedHardware();
        box(g, w - 0.02, 0.06, d - 0.06, "#2a2c2e", 0, 0, -0.03);
        rbox(g, w, h - 0.06, d - 0.05, fm, 0, 0.06, -0.025, 0.02);
        box(g, w - 0.01, h - 0.07, 0.003, "#2a2c2e", 0, 0.065, fz + 0.0015); // 门缝
        if (w > 0.85) {
          for (const s of [-1, 1]) {
            rbox(g, w / 2 - 0.004, h - 0.08, 0.04, fm, (s * w) / 4, 0.07, fz + 0.023, 0.012); // 对开门
            pull(g, 0.8, true, s * 0.035, 1.05, fz + 0.043, hwf);
          }
          box(g, 0.1, 0.14, 0.003, screen("#2a6f8f"), -w / 4, 1.25, fz + 0.044);
        } else {
          rbox(g, w - 0.006, 1.06, 0.04, fm, 0, 0.72, fz + 0.023, 0.012); // 冷藏门
          rbox(g, w - 0.006, 0.64, 0.04, fm, 0, 0.07, fz + 0.023, 0.012); // 冷冻抽屉
          pull(g, 0.5, true, -w / 2 + 0.06, 1.05, fz + 0.043, hwf);
          pull(g, w * 0.5, false, 0, 0.64, fz + 0.043, hwf);
          box(g, 0.08, 0.1, 0.003, screen("#2a6f8f"), w * 0.22, 1.4, fz + 0.044);
        }
        break;
      }
      case "toilet": {
        const cer = ceramic(), Rb = w * 0.45, zc = bz + d * 0.62, kz = (d * 0.37) / Rb, cm = chrome(), seat = mat("#f4f4f2", 0.2);
        rbox(g, w * 0.88, 0.4, d * 0.24, cer, 0, 0.36, bz + d * 0.12, 0.04); // 水箱
        rbox(g, w * 0.92, 0.03, d * 0.27, cer, 0, 0.76, bz + d * 0.135, 0.012);
        cylinder(g, 0.022, 0.022, 0.006, cm, 0, 0.79, bz + d * 0.135, 20); // 冲水按钮
        lathe(g, [[0, 0], [Rb * 0.62, 0], [Rb * 0.66, 0.02], [Rb * 0.56, 0.12], [Rb * 0.62, 0.22], [Rb * 0.92, 0.33], [Rb, 0.37]], cer, 0, 0, zc, 40).scale.z = kz; // 座体
        cylinder(g, Rb * 1.01, Rb * 1.01, 0.022, seat, 0, 0.37, zc, 40).scale.z = kz; // 座圈
        cylinder(g, Rb * 0.97, Rb * 0.99, 0.02, seat, 0, 0.392, zc, 40).scale.z = kz; // 盖板
        for (const s of [-1, 1]) box(g, 0.03, 0.02, 0.03, cm, s * w * 0.18, 0.39, zc - Rb * kz - 0.005); // 铰链
        break;
      }
      case "vanity": {
        const vm = mat(c, 0.5), stone = mat("#fafafa", 0.18), nb = w >= 1.1 ? 2 : 1, cd = d - 0.04;
        rbox(g, w, 0.45, cd, vm, 0, 0.33, bz + cd / 2, 0.008); // 悬挂柜体
        fronts(g, -w / 2 + 0.005, 0.335, w - 0.01, 0.44, d / 2 - 0.04, nb, 2, vm, hw, "edge");
        rbox(g, w, 0.03, d, stone, 0, 0.78, 0, 0.006); // 台面
        const rb = Math.min(0.19, (w / nb) * 0.36);
        for (let i = 0; i < nb; i++) {
          const x = nb === 1 ? 0 : i ? w / 4 : -w / 4;
          lathe(g, [[0, 0], [rb * 0.55, 0], [rb * 0.85, 0.03], [rb, 0.1], [rb * 0.97, 0.12]], ceramic(0.12, DOUBLE), x, 0.81, 0.03, 40); // 台上盆
          cylinder(g, 0.018, 0.018, 0.003, hw, x, 0.812, 0.03, 16); // 下水口
          cylinder(g, 0.02, 0.022, 0.02, hw, x, 0.81, bz + 0.06, 16); // 龙头
          tube(g, [[x, 0.83, bz + 0.06], [x, 1.03, bz + 0.06], [x, 1.07, bz + 0.11], [x, 1.03, bz + 0.15]], 0.01, hw);
          rot(box(g, 0.01, 0.01, 0.06, hw, x, 1.05, bz + 0.04), 0.4);
        }
        const mw = Math.min(w * 0.9, nb * 0.7);
        rbox(g, mw + 0.02, 0.82, 0.02, glow("#fff7e6", "#ffe9c4", 0.9), 0, 1.14, bz + 0.01, 0.01); // 镜后灯带
        box(g, mw, 0.8, 0.01, mirror(), 0, 1.15, bz + 0.025); // 镜子
        cylinder(g, 0.028, 0.028, 0.12, mat("#c8b8a6", 0.3), w / 2 - 0.08, 0.81, bz + 0.1, 16); // 香薰
        rbox(g, 0.18, 0.03, 0.12, fabric(look.accent), -w / 2 + 0.12, 0.81, 0.05, 0.012); // 毛巾
        break;
      }
      case "shower": {
        const cm = chrome(), fr = profile(), x = -w / 4;
        rbox(g, w, 0.05, d, mat("#f4f4f2", 0.3), 0, 0, 0, 0.01); // 底盆
        box(g, w * 0.6, 0.003, 0.05, mat("#9aa1a8", 0.3, 0.8), 0, 0.05, bz + 0.08); // 线性地漏
        for (const [gw, gd, px, pz] of [[w, 0.01, 0, d / 2 - 0.005], [0.01, d, w / 2 - 0.005, 0]])
          box(g, gw, 1.95, gd, glass(), px, 0.05, pz).castShadow = false; // 玻璃隔断
        box(g, 0.02, 1.95, 0.02, fr, w / 2 - 0.01, 0.05, d / 2 - 0.01);
        box(g, 0.02, 1.95, 0.03, fr, -w / 2 + 0.01, 0.05, d / 2 - 0.005);
        box(g, 0.03, 1.95, 0.02, fr, w / 2 - 0.005, 0.05, bz + 0.01);
        box(g, w, 0.015, 0.02, fr, 0, 1.985, d / 2 - 0.005);
        box(g, 0.02, 0.015, d, fr, w / 2 - 0.005, 1.985, 0);
        rbox(g, 0.14, 0.1, 0.04, cm, x, 1.0, bz + 0.02, 0.01); // 混水阀
        rod(g, [x, 1.1, bz + 0.03], [x, 1.95, bz + 0.03], 0.012, cm);
        tube(g, [[x, 1.95, bz + 0.03], [x, 2.02, bz + 0.06], [x, 2.03, bz + 0.22]], 0.01, cm);
        rbox(g, 0.24, 0.012, 0.24, cm, x, 2.02, bz + 0.25, 0.004); // 顶喷
        rot(cylinder(g, 0.015, 0.02, 0.2, cm, x + 0.1, 1.25, bz + 0.05, 16), 0.25); // 手持花洒
        sphere(g, 0.03, 0.012, 0.03, cm, x + 0.1, 1.47, bz + 0.08, 16);
        box(g, 0.26, 0.012, 0.1, ceramic(), w / 2 - 0.2, 1.2, bz + 0.05); // 置物架
        ([["#e6dccd", 0.03, 0.18], ["#2f5d62", 0.025, 0.15], ["#f4f4f2", 0.028, 0.12]] as const).forEach(([bc, br, bh], i) =>
          cylinder(g, br, br, bh, mat(bc, 0.3), w / 2 - 0.28 + i * 0.07, 1.212, bz + 0.05, 16),
        );
        break;
      }
      case "bathtub": {
        const cer = ceramic(), h = 0.56, t = 0.07, cm = chrome(), fx = w / 2 - t / 2;
        shell(g, w, d, h, t, 0.14, cer); // 缸壁
        box(g, w - 0.1, 0.12, d - 0.1, cer, 0, 0, 0); // 缸底
        box(g, w - 2 * t + 0.004, 0.004, d - 2 * t + 0.004, mat("#bfe0ea", 0.03, 0, { transparent: true, opacity: 0.6 }), 0, 0.4, 0); // 水面
        tube(g, [[fx, h - 0.02, 0], [fx, h + 0.1, 0], [fx - 0.06, h + 0.13, 0], [fx - 0.13, h + 0.09, 0]], 0.014, cm); // 龙头
        for (const s of [-1, 1]) cylinder(g, 0.02, 0.02, 0.04, cm, fx, h, s * 0.1, 16);
        rot(rbox(g, 0.08, 0.16, 0.3, cer, -w / 2 + t + 0.06, h - 0.12, 0, 0.04), 0, 0, -0.5); // 头枕
        rbox(g, 0.22, 0.05, 0.16, fabric("#e9e2d6"), fx - 0.05, h, d / 2 - 0.1, 0.02); // 毛巾
        break;
      }
      case "washer":
      case "dryer": {
        const bm = mat(c, 0.35), R0 = Math.min(w, d) * 0.25, fz = d / 2 - 0.02, Rs = R0 * 1.42;
        box(g, w - 0.02, 0.04, d - 0.04, "#8f969b", 0, 0, -0.02);
        rbox(g, w, 0.81, d - 0.02, bm, 0, 0.04, -0.01, 0.025);
        box(g, w - 0.04, 0.1, 0.006, lighter(c, 0.3), 0, 0.72, fz + 0.003); // 控制面板
        rbox(g, 0.18, 0.07, 0.01, bm, -w / 2 + 0.12, 0.735, fz + 0.006, 0.004); // 投放盒
        box(g, 0.12, 0.035, 0.003, screen("#1f6f6a"), w * 0.14, 0.745, fz + 0.007);
        rot(cylinder(g, 0.03, 0.03, 0.02, chrome(), -w * 0.02, 0.75, fz + 0.016, 28), Math.PI / 2); // 旋钮
        mesh(g, new THREE.CircleGeometry(R0, 40), mat("#1b1f22", 0.6), 0, 0.4, fz + 0.004).castShadow = false; // 滚筒
        mesh(g, new THREE.TorusGeometry(R0 + 0.02, 0.022, 14, 48), mat("#c7cfd5", 0.25, 0.7), 0, 0.4, fz + 0.016); // 门圈
        rot(
          mesh(g, new THREE.SphereGeometry(Rs, 32, 12, 0, Math.PI * 2, 0, 0.78), mat(f.type === "dryer" ? "#4a4038" : "#26343d", 0.04, 0.2, { transparent: true, opacity: 0.8 }), 0, 0.4, fz + 0.012 - Rs * Math.cos(0.78)),
          Math.PI / 2,
        ).castShadow = false; // 舱门玻璃
        box(g, w - 0.06, 0.004, 0.003, "#b9c3ca", 0, 0.08, fz + 0.002);
        break;
      }
      case "crib": {
        const wm = woodMat(c), bear = "#c9a27a", bx = -w * 0.3 + 0.1;
        rbox(g, w - 0.09, 0.12, d - 0.09, fabric("#ffffff"), 0, 0.3, 0, 0.04); // 床垫
        box(g, w - 0.06, 0.025, d - 0.06, wm, 0, 0.28);
        for (const [a, b] of CORNERS) {
          rbox(g, 0.045, 0.95, 0.045, wm, a * (w / 2 - 0.022), 0, b * (d / 2 - 0.022), 0.008); // 立柱
          sphere(g, 0.028, 0.028, 0.028, wm, a * (w / 2 - 0.022), 0.97, b * (d / 2 - 0.022), 14);
        }
        for (const s of [-1, 1]) {
          const z = s * (d / 2 - 0.022), x = s * (w / 2 - 0.022);
          for (const y of [0.88, 0.25]) {
            rbox(g, w - 0.05, 0.035, 0.03, wm, 0, y, z, 0.008);
            rbox(g, 0.03, 0.035, d - 0.05, wm, x, y, 0, 0.008);
          }
          for (let p = -w / 2 + 0.09; p < w / 2 - 0.05; p += 0.075) rod(g, [p, 0.28, z], [p, 0.88, z], 0.009, wm, 0.009, 8); // 围栏
          for (let p = -d / 2 + 0.09; p < d / 2 - 0.05; p += 0.075) rod(g, [x, 0.28, p], [x, 0.88, p], 0.009, wm, 0.009, 8);
        }
        rbox(g, w * 0.5, 0.03, d - 0.14, fabric("#f3d9c9"), w * 0.12, 0.42, 0, 0.015); // 小被子
        rbox(g, 0.3, 0.06, 0.2, fabric("#fbfaf7"), -w / 2 + 0.22, 0.42, 0, 0.03); // 小枕头
        sphere(g, 0.05, 0.06, 0.045, bear, bx, 0.5, 0.12); // 小熊
        sphere(g, 0.045, 0.042, 0.04, bear, bx, 0.59, 0.12);
        sphere(g, 0.016, 0.016, 0.01, bear, bx - 0.032, 0.625, 0.12);
        sphere(g, 0.016, 0.016, 0.01, bear, bx + 0.032, 0.625, 0.12);
        break;
      }
      case "beanbag": {
        const fab = mat(c, 0.95);
        sphere(g, w * 0.5, 0.3, d * 0.5, fab, 0, 0.3, 0, 40);
        sphere(g, w * 0.42, 0.22, d * 0.22, fab, 0, 0.5, bz + d * 0.26, 32); // 靠背鼓包
        break;
      }
      case "sidetable": {
        const r = Math.min(w, d) / 2;
        lathe(g, [[r * 0.55, 0], [r * 0.55, 0.012], [0.03, 0.035], [0.018, 0.3], [0.025, 0.5], [0.08, 0.52]], metalFrame(look), 0, 0, 0, 40); // 底座
        cylinder(g, r, r * 0.98, 0.025, mat(c, 0.35), 0, 0.52, 0, 48);
        box(g, 0.16, 0.02, 0.12, "#4f6b8a", -r * 0.25, 0.545, 0); // 书
        vase(g, r * 0.35, 0.545, -r * 0.1, 0.035, 0.12, "#e9e2d6", R, false);
        break;
      }
      case "floorlamp": {
        const r = Math.min(w, d) / 2, lm = mat(c, 0.35, 0.5);
        lathe(g, [[0, 0], [r * 0.55, 0], [r * 0.58, 0.012], [r * 0.5, 0.03], [0.02, 0.035]], lm, 0, 0, 0, 40); // 底盘
        rod(g, [0, 0.03, 0], [0, 1.36, 0], 0.011, lm);
        lathe(g, [[r * 0.85, 0], [r * 0.55, 0.36]], glow("#f6ecd9", "#ffdca0", 0.45), 0, 1.22, 0, 48); // 灯罩
        sphere(g, 0.035, 0.035, 0.035, glow("#fff", "#ffe2b0", 1.2), 0, 1.36, 0, 12);
        ring(g, r * 0.85, 0.004, lm, 0, 1.22, 0);
        ring(g, r * 0.55, 0.004, lm, 0, 1.58, 0);
        break;
      }
      case "island": {
        const cm = mat(c, 0.45), stone = mat("#dcd7cf", 0.2), cd = d - 0.3, n = Math.max(1, Math.round((w - 0.1) / 0.6)),
          cab = new THREE.Group(), fz = cd / 2 - 0.03;
        box(cab, w - 0.12, 0.1, cd - 0.08, look.legs, 0, 0, -0.04); // 踢脚
        box(cab, w - 0.1, 0.74, cd - 0.03, cm, 0, 0.1, -0.015);
        fronts(cab, -w / 2 + 0.05, 0.64, w - 0.1, 0.2, fz, n, 1, cm, hw);
        fronts(cab, -w / 2 + 0.05, 0.1, w - 0.1, 0.54, fz, n, 1, cm, hw, "bar", 0.56);
        cab.rotation.y = Math.PI; // 柜门朝 -z，+z 侧留出吧台挑空
        cab.position.z = bz + cd / 2;
        g.add(cab);
        rbox(g, w, 0.05, d, stone, 0, 0.84, 0, 0.006); // 台面
        for (const s of [-1, 1]) box(g, 0.04, 0.84, d, stone, s * (w / 2 - 0.02), 0, 0); // 瀑布式侧板
        lathe(g, [[0, 0], [0.06, 0], [0.14, 0.06], [0.15, 0.07]], mat(darker(look.wood, 0.53), 0.5, 0, DOUBLE), w * 0.22, 0.89, 0, 32); // 果盘
        ["#d98c4a", "#9fbf5a", "#b5463a", "#e6c14f"].forEach((fc, k) =>
          sphere(g, 0.04, 0.04, 0.04, fc, w * 0.22 + Math.cos(k * 1.6) * 0.05, 0.935 + (k === 3 ? 0.04 : 0), Math.sin(k * 1.6) * 0.05, 14),
        );
        vase(g, -w * 0.25, 0.89, -0.05, 0.05, 0.22, "#e9e2d6", R);
        break;
      }
      case "barstool": {
        const r = Math.min(w, d) / 2, fm = metalFrame(look), sy = 0.7;
        for (const [a, b] of CORNERS) rod(g, [a * r * 0.72, 0, b * r * 0.72], [a * r * 0.4, sy, b * r * 0.4], 0.011, fm);
        ring(g, Math.SQRT2 * r * (0.72 - 0.32 * 0.4), 0.008, fm, 0, 0.28, 0); // 踏脚圈
        cylinder(g, r * 0.55, r * 0.55, 0.02, fm, 0, sy - 0.01, 0, 32);
        lathe(g, [[0, 0], [r * 0.85, 0], [r * 0.95, 0.02], [r * 0.97, 0.045], [r * 0.9, 0.07], [0, 0.075]], mat(c, 0.6), 0, sy, 0, 40); // 坐面
        break;
      }
      case "waterheater": {
        const r = Math.min(d / 2, 0.23), L = w - 0.06, yc = 1.95, zc = bz + r + 0.02, cap = mat("#cfd4d8", 0.4);
        rot(mesh(g, new THREE.CylinderGeometry(r, r, L, 40), mat(c, 0.35), 0, yc, zc), 0, 0, Math.PI / 2); // 罐体
        for (const s of [-1, 1]) {
          sphere(g, 0.035, r * 0.99, r * 0.99, cap, (s * L) / 2, yc, zc, 32); // 端盖
          box(g, 0.05, r * 1.1, 0.02, "#9a9ea3", s * L * 0.3, yc - r * 0.55, bz + 0.01); // 挂架
        }
        rbox(g, 0.2, 0.09, 0.02, "#e7eaec", L * 0.18, yc - 0.05, zc + r * 0.93, 0.008); // 控制面板
        box(g, 0.07, 0.03, 0.002, screen("#2f8f7a"), L * 0.18 - 0.04, yc - 0.02, zc + r * 0.93 + 0.011);
        for (const [x, pc] of [[-L * 0.3, "#3b7bbf"], [-L * 0.18, "#c0463a"]] as const) {
          rod(g, [x, yc - r * 0.8, zc], [x, 1.3, zc], 0.012, steel()); // 冷 / 热水管
          cylinder(g, 0.02, 0.02, 0.03, pc, x, 1.5, zc, 12);
        }
        break;
      }
      case "tv": {
        const th = w * 0.5625, yb = 1.2 - th / 2, z = bz + 0.03;
        rbox(g, w * 0.6, th * 0.6, 0.03, "#222", 0, yb + th * 0.2, bz + 0.015, 0.01); // 挂架
        rbox(g, w, th, 0.025, mat("#18181a", 0.4, 0.3), 0, yb, z + 0.01, 0.004);
        box(g, w - 0.016, th - 0.022, 0.002, screen("#1f2b3a"), 0, yb + 0.014, z + 0.0235);
        box(g, 0.04, 0.006, 0.002, "#8a8a8e", 0, yb + 0.004, z + 0.0235); // 标志
        break;
      }
      case "aircon": {
        const am = mat(c, 0.3), h = 1.8, fz = d / 2 - 0.005;
        rbox(g, w, 0.06, d, "#cfd3d6", 0, 0, 0, 0.015); // 底座
        rbox(g, w - 0.01, h - 0.06, d - 0.01, am, 0, 0.06, 0, 0.06);
        rbox(g, w - 0.06, 1.0, 0.01, mat(lighter(c, 0.4), 0.12), 0, 0.22, fz, 0.005); // 面板
        box(g, w - 0.1, 0.42, 0.01, "#3d4145", 0, 1.28, fz); // 出风口
        for (let i = 0; i < 8; i++) rot(box(g, w - 0.11, 0.012, 0.03, "#e4e7ea", 0, 1.3 + i * 0.05, fz + 0.008), -0.35);
        box(g, 0.1, 0.035, 0.003, led("#4fb3a5", 0.7), 0, 1.12, fz + 0.006);
        for (let i = 0; i < 8; i++) box(g, w - 0.12, 0.005, 0.004, "#b9bfc4", 0, 0.09 + i * 0.015, fz + 0.002); // 进风格栅
        break;
      }
      case "acwall": {
        const h = 0.3, am = mat(c, 0.3), s = new THREE.Shape();
        s.moveTo(0, 0.02);
        s.lineTo(0, h);
        s.lineTo(d * 0.75, h);
        s.quadraticCurveTo(d, h, d, h * 0.55);
        s.quadraticCurveTo(d, 0, d * 0.55, 0);
        s.lineTo(0.02, 0);
        s.lineTo(0, 0.02);
        const geo = new THREE.ExtrudeGeometry(s, { depth: w - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.006, bevelSegments: 3, curveSegments: 16 });
        geo.rotateY(-Math.PI / 2);
        geo.translate((w - 0.02) / 2, 2.2, bz);
        mesh(g, geo, am); // 机身截面拉伸
        box(g, w - 0.12, 0.004, 0.07, "#3a3d40", 0, 2.19, bz + d * 0.55); // 出风口
        rot(box(g, w - 0.12, 0.008, 0.06, am, 0, 2.18, bz + d * 0.72), 0.35); // 导风板
        box(g, 0.06, 0.018, 0.002, led("#4fb3a5", 0.7), w * 0.3, 2.2 + h * 0.5, bz + d + 0.007);
        for (let i = 0; i < 6; i++) box(g, w - 0.12, 0.003, 0.008, "#d5d9dc", 0, 2.2 + h + 0.006, bz + 0.03 + i * 0.022); // 进风格栅
        break;
      }
      case "dishwasher": {
        const dm = mat(c, 0.28, 0.55), fz = d / 2 - 0.02;
        box(g, w - 0.01, 0.08, d - 0.07, "#3a3834", 0, 0, -0.035);
        box(g, w - 0.005, 0.76, d - 0.03, "#8b9095", 0, 0.08, -0.015);
        rbox(g, w - 0.006, 0.7, 0.02, dm, 0, 0.085, fz, 0.004); // 门板
        box(g, w - 0.006, 0.055, 0.02, "#26282a", 0, 0.785, fz); // 控制条
        for (let i = 0; i < 4; i++) box(g, 0.012, 0.006, 0.002, led(i ? "#6fd0ff" : "#7fe08a", 0.8), w * 0.1 + i * 0.03, 0.81, fz + 0.011);
        pull(g, w * 0.6, false, 0, 0.74, fz + 0.01, fixedHardware());
        break;
      }
      case "ovencol": {
        const cm = mat(c, 0.5), h = 2.1, fz = d / 2 - 0.02, frm = mat("#1c1d1f", 0.3, 0.5), gl = mat("#0b0c0d", 0.03, 0.6);
        box(g, w - 0.02, 0.08, d - 0.06, look.legs, 0, 0, -0.03); // 踢脚
        box(g, w, h - 0.08, d - 0.02, cm, 0, 0.08, -0.01);
        fronts(g, -w / 2, 0.08, w, 0.6, fz, 1, 2, cm, hw); // 下部抽屉
        fronts(g, -w / 2, 1.78, w, h - 1.8, fz, 1, 1, cm, hw, "bar", 1.84); // 顶柜
        for (const [y, ah] of [[0.7, 0.58], [1.3, 0.46]]) {
          box(g, w - 0.02, ah - 0.01, 0.02, frm, 0, y, fz + 0.01); // 烤箱 / 蒸箱
          box(g, w - 0.1, ah * 0.52, 0.003, gl, 0, y + ah * 0.1, fz + 0.021);
          box(g, w - 0.04, 0.06, 0.003, "#2a2c2e", 0, y + ah - 0.075, fz + 0.021);
          box(g, 0.08, 0.022, 0.002, led("#ff9a3c", 0.7), 0, y + ah - 0.056, fz + 0.023);
          pull(g, w * 0.7, false, 0, y + ah * 0.72, fz + 0.02, hw);
        }
        break;
      }
      case "purifier": {
        const pm = mat(c, 0.45), h = 0.72;
        rbox(g, w, h, d, pm, 0, 0, 0, Math.min(w, d) * 0.2);
        rbox(g, w - 0.05, 0.006, d - 0.05, "#8d959b", 0, h - 0.002, 0, 0.02); // 顶部出风
        for (let i = 0; i < 7; i++) box(g, w - 0.07, 0.004, 0.006, "#6f777d", 0, h + 0.002, -d / 2 + 0.05 + (i * (d - 0.1)) / 6);
        rbox(g, w - 0.06, 0.42, 0.006, fabric("#c8ccd0"), 0, 0.06, d / 2 - 0.001, 0.01); // 进风滤网
        mesh(g, new THREE.TorusGeometry(0.03, 0.004, 8, 32), led("#4fb3a5", 0.8), 0, 0.6, d / 2 + 0.002).castShadow = false; // 指示灯
        break;
      }
      case "piano": {
        const pk = mat(c, 0.12, 0.1), bd = d * 0.5, kz = bz + bd, h = 1.25, kd = d * 0.22 - 0.03,
          iv = mat("#faf8f3", 0.3), eb = mat("#111", 0.25), kw = (w - 0.12) / 52;
        box(g, w, h, bd, pk, 0, 0, bz + bd / 2); // 琴身
        rbox(g, w + 0.02, 0.03, bd + 0.03, pk, 0, h, bz + bd / 2 + 0.01, 0.008); // 顶盖
        for (const s of [-1, 1]) {
          rbox(g, 0.06, 0.13, kd + 0.06, pk, s * (w / 2 - 0.03), 0.6, kz + (kd + 0.06) / 2, 0.01); // 键盘侧板
          box(g, 0.05, 0.6, 0.05, pk, s * (w / 2 - 0.08), 0, kz + kd + 0.01); // 琴腿
          box(g, 0.06, 0.04, d - bd, pk, s * (w / 2 - 0.08), 0, kz + (d - bd) / 2); // 脚托
        }
        box(g, w - 0.12, 0.08, kd + 0.05, pk, 0, 0.6, kz + (kd + 0.05) / 2);
        box(g, w - 0.12, 0.1, 0.03, pk, 0, 0.68, kz + 0.015);
        for (let i = 0; i < 52; i++) {
          const x = -w / 2 + 0.06 + kw * (i + 0.5);
          box(g, kw - 0.0015, 0.022, kd, iv, x, 0.68, kz + 0.03 + kd / 2); // 白键
          if (i < 51 && "ACDFG".includes("ABCDEFG"[i % 7])) box(g, kw * 0.58, 0.02, kd * 0.62, eb, x + kw / 2, 0.7, kz + 0.03 + kd * 0.31); // 黑键
        }
        rot(box(g, w * 0.42, 0.18, 0.012, pk, 0, 0.84, kz + 0.012), -0.25); // 谱架
        for (const x of [-0.06, 0, 0.06]) box(g, 0.025, 0.012, 0.07, mat("#c9a35a", 0.3, 0.9), x, 0.05, kz + 0.03); // 踏板
        cylinder(g, 0, 0.05, 0.2, woodMat("#5a3e2b"), w * 0.3, h + 0.03, bz + bd / 2, 4).rotation.y = Math.PI / 4; // 节拍器
        rot(box(g, 0.14, 0.18, 0.015, woodMat("#c9a27a"), -w * 0.3, h + 0.03, bz + 0.06), -0.15); // 相框
        rot(box(g, 0.11, 0.14, 0.002, "#9fb3c2", -w * 0.3, h + 0.05, bz + 0.07), -0.15);
        break;
      }
      case "treadmill": {
        const tm = mat(c, 0.55), bm = mat("#2a2a2c", 0.5), al = mat("#9a9ea3", 0.4, 0.6), cg = new THREE.Group();
        rbox(g, w, 0.14, d - 0.25, tm, 0, 0.03, 0.125, 0.03); // 跑台
        box(g, w - 0.16, 0.006, d - 0.5, "#141414", 0, 0.17, 0.15); // 跑带
        for (const s of [-1, 1]) box(g, 0.07, 0.008, d - 0.45, al, s * (w / 2 - 0.05), 0.17, 0.15);
        for (const z of [bz + 0.06, d / 2 - 0.06]) for (const s of [-1, 1]) box(g, 0.06, 0.03, 0.06, bm, s * (w / 2 - 0.06), 0, z);
        rbox(g, w, 0.22, 0.32, tm, 0, 0, bz + 0.16, 0.05); // 电机罩
        for (const s of [-1, 1]) {
          rod(g, [s * (w / 2 - 0.06), 0.15, bz + 0.2], [s * (w / 2 - 0.06), 1.15, bz + 0.3], 0.025, bm, 0.022); // 立柱
          tube(g, [[s * (w / 2 - 0.06), 1.0, bz + 0.28], [s * (w / 2 - 0.06), 1.0, bz + 0.5], [s * (w / 2 - 0.07), 0.97, bz + 0.62]], 0.018, bm); // 扶手
        }
        cg.position.set(0, 1.2, bz + 0.31);
        cg.rotation.x = -0.5;
        rbox(cg, w * 0.8, 0.2, 0.08, bm, 0, -0.1, 0, 0.02); // 仪表台
        box(cg, w * 0.4, 0.11, 0.004, screen("#2a5d8f"), 0, -0.055, 0.041);
        g.add(cg);
        break;
      }
      default:
        box(g, w, 0.7, d, c);
    }
  roundness = 1;
  mergeParts(g);
  if (f.height) {
    g.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(g),
      modelHeight = bounds.max.y - bounds.min.y;
    if (modelHeight > 0) g.scale.y = f.height / 1000 / modelHeight;
  }
  g.position.set(f.cx / 1000, 0, f.cy / 1000);
  g.rotation.y = (-f.rot * Math.PI) / 180;
  g.userData.fid = f.id;
  return g;
}
