import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { edgeCursor, resizeFurnitureEdge, snapFurnitureEdge } from './furnitureResize';
import type { Design, Furniture } from './types';

const furn = (rot = 0): Furniture => ({ id: 'f', type: 'sofa', name: '沙发', cx: 1000, cy: 1000, w: 1000, d: 600, rot, color: '#ccc' });
/** 家具四条边在图纸坐标里的位置（rot=0 时） */
const edges = (f: { cx: number; cy: number; w: number; d: number }) => ({ w: f.cx - f.w / 2, e: f.cx + f.w / 2, n: f.cy - f.d / 2, s: f.cy + f.d / 2 });

describe('resizeFurnitureEdge', () => {
  it('拖右边：右边跟随指针，左 / 上 / 下边不动', () => {
    const before = edges(furn());
    const after = edges(resizeFurnitureEdge(furn(), 'e', [1800, 1234], 50));
    expect(after).toEqual({ ...before, e: 1800 });
  });

  it('拖左边、上边、下边：只有被拖的边移动', () => {
    const before = edges(furn());
    expect(edges(resizeFurnitureEdge(furn(), 'w', [300, 0], 50))).toEqual({ ...before, w: 300 });
    expect(edges(resizeFurnitureEdge(furn(), 'n', [0, 500], 50))).toEqual({ ...before, n: 500 });
    expect(edges(resizeFurnitureEdge(furn(), 's', [0, 1500], 50))).toEqual({ ...before, s: 1500 });
  });

  it('长度按拖动步进取整，不小于 10 cm', () => {
    expect(resizeFurnitureEdge(furn(), 'e', [1520, 0], 50).w).toBe(1000);
    expect(resizeFurnitureEdge(furn(), 'e', [1540, 0], 50).w).toBe(1050);
    const tiny = resizeFurnitureEdge(furn(), 'e', [-5000, 0], 50);
    expect(tiny.w).toBe(100);
    expect(tiny.cx - tiny.w / 2).toBe(500);
  });

  it('旋转 90° 时拖局部右边（屏幕下方）：对边位置不变', () => {
    // rot=90：局部 x 指向图纸 +y，右边在 cy+500，左边在 cy-500
    const r = resizeFurnitureEdge(furn(90), 'e', [1000, 1800], 50);
    expect(r.w).toBe(1300);
    expect(r.cy - r.w / 2).toBeCloseTo(500);
    expect(r.cx).toBeCloseTo(1000);
    expect(r.d).toBe(600);
  });
});

describe('edgeCursor', () => {
  it('按旋转后的边法向给出光标', () => {
    expect(edgeCursor(0, 'e')).toBe('ew-resize');
    expect(edgeCursor(0, 'n')).toBe('ns-resize');
    expect(edgeCursor(90, 'e')).toBe('ns-resize');
    expect(edgeCursor(45, 'e')).toBe('nwse-resize');
    expect(edgeCursor(-45, 'w')).toBe('nesw-resize');
  });
});

describe('snapFurnitureEdge（与拖动共用对齐规则）', () => {
  // 沙发右边在 x=1500；地毯在 x 1600–2600，远离墙。
  const sofa = { ...furn(), cx: 3000, cy: 3000 };
  const rug: Furniture = { id: 'rug', type: 'rug', name: '地毯', cx: 4100, cy: 2000, w: 1000, d: 1000, rot: 0, color: '#ccc' };
  const design = (): Design => ({ ...blankDesign(), furniture: [sofa, rug] });

  it('右边拖到靠近其他家具左边：吸附对齐并给出竖向对齐线，左边不动', () => {
    const r = snapFurnitureEdge(design(), sofa, 'e', [3612, 3000], true, 20);
    expect(r.patch.cx + r.patch.w / 2).toBe(3600);
    expect(r.patch.cx - r.patch.w / 2).toBe(2500);
    expect(r.guides).toContainEqual(expect.objectContaining({ axis: 'x', at: 3600 }));
  });

  it('关闭吸附或超出容差：只按步进取整，没有对齐线', () => {
    expect(snapFurnitureEdge(design(), sofa, 'e', [3612, 3000], false, 20).guides).toEqual([]);
    const far = snapFurnitureEdge(design(), sofa, 'e', [3540, 3000], true, 20);
    expect(far.guides).toEqual([]);
    expect(far.patch.w).toBe(1050);
  });
});
