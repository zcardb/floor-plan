export interface RasterLimits {
  /** 单边像素上限。 */
  maxSide: number;
  /** 总像素上限（iOS Safari 为 16,777,216）。 */
  maxArea: number;
  /** 期望的宽度（长边不超限时使用）。 */
  target: number;
}

export const IOS_CANVAS_LIMITS: RasterLimits = { maxSide: 4096, maxArea: 16_777_216, target: 3200 };

/**
 * 按期望宽度计算导出画布尺寸，并等比缩小到设备画布上限以内。
 * 超过上限时 getContext 会返回 null，导出就会静默失败。
 */
export function rasterSize(w: number, h: number, limits: RasterLimits = IOS_CANVAS_LIMITS): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) throw new Error("导出尺寸无效");
  const ratio = h / w;
  let width = limits.target;
  width = Math.min(width, limits.maxSide, limits.maxSide / ratio, Math.sqrt(limits.maxArea / ratio));
  const out = { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(width * ratio)) };
  return out;
}
