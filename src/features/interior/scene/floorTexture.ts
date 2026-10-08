import * as THREE from "three";
import type { FloorMaterial } from "../model/floorMaterials";

/** 按铺贴样式绘制可平铺的地面贴图；repeat 以米为单位换算到单块尺寸。 */
export function floorTexture(m: FloorMaterial) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = m.color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#a79d8960";
  ctx.lineWidth = 2;
  let repeat: [number, number] = [1, 1];
  if (m.pattern === "plank") {
    const length = (m.length || 1200) / 1000, width = (m.width || 180) / 1000;
    for (const y of [0, 128]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.moveTo(y ? 85 : 170, y);
      ctx.lineTo(y ? 85 : 170, y + 128);
      ctx.stroke();
    }
    repeat = [1 / (length * 1.5), 1 / (width * 2)];
  } else if (m.pattern === "tile") {
    ctx.strokeRect(0, 0, 256, 256);
    repeat = [1000 / (m.length || 600), 1000 / (m.width || 600)];
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  return texture;
}
