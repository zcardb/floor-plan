import * as THREE from "three";
import { builtinFloors, type FloorMaterial } from "../model/floorMaterials";
import { hashSeed, rng } from "./random";

/** 一种地面的贴图画法。尺寸单位为米：地面 UV 就是米，贴图按真实尺寸平铺（repeat = 1 / 尺寸）。 */
export interface FloorSurface {
  /** wood 木纹拼缝 · marble 大理石纹 · terrazzo 水磨石颗粒 · speckle 细噪点（地砖、地毯、无缝地面）。 */
  kind: "wood" | "marble" | "terrazzo" | "speckle";
  /** 一张贴图覆盖的真实宽、深（米）。 */
  sx: number;
  sy: number;
  /** 勾缝颜色；没有则不画缝。 */
  grout?: string;
  roughness: number;
  seed: number;
}

/** 内置地面：沿用参考实现的尺寸、勾缝与粗糙度。底色取地面自己的颜色，与 2D 色块一致。 */
const TEX: Record<string, Omit<FloorSurface, "seed">> = {
  wood: { kind: "wood", sx: 1.8, sy: 0.36, roughness: 0.55 },
  walnut: { kind: "wood", sx: 1.8, sy: 0.36, roughness: 0.5 },
  tile800: { kind: "speckle", sx: 0.8, sy: 0.8, grout: "#cfc6b7", roughness: 0.3 },
  tile600: { kind: "speckle", sx: 0.6, sy: 0.6, grout: "#bfc6c1", roughness: 0.35 },
  antislip: { kind: "speckle", sx: 0.3, sy: 0.3, grout: "#aab2ac", roughness: 0.8 },
  marble: { kind: "marble", sx: 1.2, sy: 1.2, grout: "#d9d2c4", roughness: 0.18 },
  terrazzo: { kind: "terrazzo", sx: 0.5, sy: 0.5, roughness: 0.4 },
  carpet: { kind: "speckle", sx: 0.3, sy: 0.3, roughness: 1 },
};

/** 按 sRGB 分量缩放颜色，用于板间色差、木纹与拼缝。 */
function rgbK(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16),
    f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** 地面的画法：内置地面按名称识别，自定义地面按铺贴样式与单块尺寸推断。 */
export function floorSurface(m: FloorMaterial): FloorSurface {
  const key = m.custom ? undefined : Object.keys(builtinFloors).find((k) => builtinFloors[k].name === m.name);
  if (key && TEX[key]) return { ...TEX[key], seed: key.length * 977 + 13 };
  const seed = hashSeed(m.name + m.color + m.pattern),
    length = (m.length || 1200) / 1000,
    width = (m.width || 180) / 1000;
  if (m.pattern === "plank") return { kind: "wood", sx: length * 1.5, sy: width * 2, roughness: 0.55, seed };
  if (m.pattern === "tile")
    return { kind: "speckle", sx: (m.length || 600) / 1000, sy: (m.width || 600) / 1000, grout: rgbK(m.color, 0.86), roughness: 0.35, seed };
  return { kind: "speckle", sx: 0.5, sy: 0.5, roughness: 0.6, seed };
}

/** 按铺贴样式绘制可平铺的地面贴图；repeat 以米为单位换算到单张贴图的真实尺寸。 */
export function floorTexture(m: FloorMaterial) {
  const s = floorSurface(m),
    R = rng(s.seed),
    base = m.color,
    cv = document.createElement("canvas");
  // 画布宽高比跟真实尺寸一致，拼缝粗细才均匀
  cv.width = s.kind === "wood" ? 1024 : 512;
  cv.height = Math.max(64, Math.min(1024, Math.round((cv.width * s.sy) / s.sx)));
  const g = cv.getContext("2d")!,
    W = cv.width,
    H = cv.height;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  if (s.kind === "wood") {
    // 两排板，接缝错开 1/3：每块板略有色差，板面画几道起伏的木纹，板缝压暗
    const rowH = H / 2,
      joints = [[(W * 2) / 3], [W / 3]];
    for (let r = 0; r < 2; r++) {
      let x0 = 0;
      for (const x1 of [...joints[r], W]) {
        g.fillStyle = rgbK(base, 0.9 + R() * 0.2);
        g.fillRect(x0, r * rowH, x1 - x0, rowH);
        g.strokeStyle = rgbK(base, 0.8);
        g.globalAlpha = 0.35;
        g.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) {
          const y = r * rowH + 6 + R() * (rowH - 12);
          g.beginPath();
          g.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 2.5);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = rgbK(base, 0.62);
        g.fillRect(x1 - 1.5, r * rowH, 3, rowH);
        x0 = x1;
      }
      g.fillStyle = rgbK(base, 0.62);
      g.fillRect(0, r * rowH, W, 2.5);
    }
  } else if (s.kind === "marble") {
    g.strokeStyle = "rgba(160,150,135,.35)";
    for (let k = 0; k < 6; k++) {
      g.lineWidth = 1 + R() * 3;
      g.beginPath();
      g.moveTo(R() * W, 0);
      g.bezierCurveTo(R() * W, R() * H, R() * W, R() * H, R() * W, H);
      g.stroke();
    }
  } else if (s.kind === "terrazzo") {
    const chips = ["#b9a58c", "#8fa3a0", "#c9b7a2", "#a88f76", "#7e8a86"];
    for (let k = 0; k < 160; k++) {
      g.fillStyle = chips[k % 5];
      g.beginPath();
      g.arc(R() * W, R() * H, 2 + R() * 7, 0, 7);
      g.fill();
    }
  } else {
    for (let k = 0; k < 1500; k++) {
      g.fillStyle = `rgba(0,0,0,${R() * 0.04})`;
      g.fillRect(R() * W, R() * H, 2, 2);
    }
  }
  if (s.grout) {
    g.fillStyle = s.grout;
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, 0, 3, H);
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / s.sx, 1 / s.sy);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
