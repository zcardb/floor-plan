import { describe, expect, it } from "vitest";
import { rasterSize } from "../canvas-limits";

describe("rasterSize", () => {
  it("3200×6400 的输入压到面积上限以内且比例不变", () => {
    const { width, height } = rasterSize(3200, 6400);
    expect(width * height).toBeLessThanOrEqual(16_777_216);
    expect(height).toBeLessThanOrEqual(4096);
    expect(height / width).toBeCloseTo(2, 2);
  });

  it("尺寸较小时保持 3200 宽", () => {
    expect(rasterSize(10000, 8000)).toEqual({ width: 3200, height: 2560 });
  });

  it("极端 1:20 比例时边长不超过 4096", () => {
    const tall = rasterSize(1000, 20000), wide = rasterSize(20000, 1000);
    for (const size of [tall, wide]) {
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(4096);
      expect(size.width * size.height).toBeLessThanOrEqual(16_777_216);
    }
    expect(tall.height / tall.width).toBeCloseTo(20, 0);
  });
});
