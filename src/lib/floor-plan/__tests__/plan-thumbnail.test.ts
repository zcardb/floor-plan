import { describe, expect, it } from 'vitest';
import { compactThumbnail, readThumbnail, thumbnailBounds, wallPieces } from '../plan-thumbnail';
import { createProject } from '../templates';
import type { Design } from '../types';

const wall = (id: string, a: [number, number], b: [number, number]) => ({ id, a, b, thickness: 200, kind: 'interior' }) as unknown as Design['walls'][number];
const design = (over: Partial<Design>) => ({ ...createProject('blank').state, rooms: [], furniture: [], ...over }) as Design;

describe('项目卡片平面缩略图', () => {
  it('有门窗的墙仍然画出：门处留洞，窗单独画线', () => {
    const d = design({
      walls: [wall('w', [0, 0], [4000, 0])],
      openings: [
        { id: 'door', wallId: 'w', kind: 'door', offset: 1000, width: 800 },
        { id: 'win', wallId: 'w', kind: 'window', offset: 3000, width: 1000 },
      ],
    });
    const { walls, windows } = wallPieces(d);
    expect(walls.map(s => [s.a[0], s.b[0]])).toEqual([[0, 600], [1400, 2500], [3500, 4000]]);
    expect(windows.map(s => [s.a[0], s.b[0]])).toEqual([[2500, 3500]]);
  });
  it('外框按真实坐标计算：偏移很大的导入图纸也完整显示', () => {
    const d = design({ width: 1000, depth: 1000, walls: [wall('w', [50000, 20000], [56000, 24000])], openings: [] });
    const b = thumbnailBounds(d);
    expect(b.x).toBeLessThan(50000);
    expect(b.x + b.w).toBeGreaterThan(56000);
    expect(b.y + b.h).toBeGreaterThan(24000);
  });
  it('瘦身后只保留绘图字段并取整，读取时能还原，坏数据当作没有', () => {
    const full = createProject('blank').state;
    const t = compactThumbnail(full);
    expect(JSON.stringify(t).length).toBeLessThan(JSON.stringify(full).length);
    expect(readThumbnail(JSON.parse(JSON.stringify(t)))?.walls.length).toBe(full.walls.length);
    expect(readThumbnail('<svg/>')).toBeNull();
    expect(readThumbnail({ v: 2 })).toBeNull();
    expect(readThumbnail(null)).toBeNull();
  });
});
