import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { rect } from './geometry';
import { dropOrphanFurniture, removeRoom } from './roomFurniture';
import { followWallFurniture } from './furnitureFollow';
import { moveWallWithJoints } from './wallMove';
import { splitAtJunctionsOf } from './wallAutoSplit';
import { placeEditor } from './selectionAnchor';
import { editSelection } from './selectionEdits';
import { placementGaps, wallPlacement } from './wallPlacement';
import { keepOpeningsInPlace, openingsFitWalls } from './openingAnchor';
import type { Design, Furniture, Wall } from './types';

const furn = (id: string, cx: number, cy: number, w = 1000, d = 600, rot = 0): Furniture =>
  ({ id, type: 'cabinet', name: id, cx, cy, w, d, rot, color: '#ccc' });
const partition: Wall = { id: 'inner', kind: 'partition', a: [2500, 0], b: [2500, 6000], thickness: 200 };
const design = (): Design => ({
  ...blankDesign(),
  template: 'reference',
  structureUnlocked: true,
  walls: [...blankDesign().walls, partition],
  rooms: [
    { id: 'left', name: '书房', mat: 'wood', rings: [rect(0, 0, 2400, 6000)] },
    { id: 'right', name: '客厅', mat: 'wood', rings: [rect(2600, 0, 3400, 6000)] },
  ],
  furniture: [furn('in-left', 1000, 3000), furn('in-right', 4000, 3000)],
});

describe('删除房间', () => {
  it('删除房间及其中家具，墙与其他房间的家具不变', () => {
    const before = design(), next = removeRoom(before, 'left');
    expect(next.rooms.map(r => r.id)).toEqual(['right']);
    expect(next.furniture.map(f => f.id)).toEqual(['in-right']);
    expect(next.walls).toBe(before.walls);
  });
  it('只剩一个房间时拒绝删除', () => {
    const d = { ...design(), rooms: design().rooms.slice(0, 1) };
    expect(() => removeRoom(d, 'left')).toThrow('至少保留一个房间');
  });
  it('dropOrphanFurniture：只删原来在房间里、现在不在任何房间里的家具', () => {
    const before = design();
    before.furniture.push(furn('outside', 20000, 20000));
    const after = { ...before, rooms: before.rooms.slice(1) };
    expect(dropOrphanFurniture(before, after).furniture.map(f => f.id)).toEqual(['in-right', 'outside']);
  });
});

describe('移墙时贴墙家具跟随', () => {
  // 隔墙两侧墙面 x = 2400 / 2600；rot 90 时家具的 d 沿 x，紧贴墙面。
  const glued = () => {
    const d = design();
    d.furniture = [furn('right-side', 2600 + 300, 3000, 1000, 600, 90), furn('left-side', 2400 - 500, 3000, 600, 1000, 90), furn('far', 2600 + 400, 1000, 1000, 600, 0)];
    return d;
  };
  const shift = (d: Design, dx: number): Design => ({ ...d, walls: d.walls.map(w => w.id === 'inner' ? { ...w, a: [w.a[0] + dx, w.a[1]], b: [w.b[0] + dx, w.b[1]] } : w) });
  it('两侧贴墙家具都沿法向平移同样距离，离墙 100 mm 的不动', () => {
    const before = glued(), next = followWallFurniture(before, shift(before, 300));
    const at = (id: string) => next.furniture.find(f => f.id === id)!;
    expect(at('right-side').cx).toBeCloseTo(2900 + 300);
    expect(at('left-side').cx).toBeCloseTo(1900 + 300);
    expect(at('far').cx).toBe(3000);
  });
  it('沿墙方向滑动墙不带家具', () => {
    const before = glued();
    const slid = { ...before, walls: before.walls.map(w => w.id === 'inner' ? { ...w, a: [w.a[0], w.a[1] + 500] as [number, number], b: [w.b[0], w.b[1] + 500] as [number, number] } : w) };
    expect(followWallFurniture(before, slid)).toBe(slid);
  });
  it('端点拖动（改变墙长或角度）不带家具', () => {
    const before = glued();
    const rotated = { ...before, walls: before.walls.map(w => w.id === 'inner' ? { ...w, b: [w.b[0] + 400, w.b[1]] as [number, number] } : w) };
    expect(followWallFurniture(before, rotated)).toBe(rotated);
  });
});

describe('移墙时端点沿连接墙滑动', () => {
  it('两端接在上下外墙上的隔墙：只沿法向平移，端点留在外墙上', () => {
    const before = design();
    const next = moveWallWithJoints(before, 'inner', [400, 300])!;
    const w = next.walls.find(w => w.id === 'inner')!;
    expect(w.a).toEqual([2900, 0]);
    expect(w.b).toEqual([2900, 6000]);
  });
  it('L 形相接的墙随之伸缩，保持连接', () => {
    const d = design();
    const arm: Wall = { id: 'arm', kind: 'partition', a: [2500, 3000], b: [4000, 3000], thickness: 200 };
    d.walls = [...d.walls.filter(w => w.id !== 'inner'), { ...partition, b: [2500, 3000] }, arm];
    const next = moveWallWithJoints(d, 'arm', [0, 500])!;
    expect(next.walls.find(w => w.id === 'arm')!.a).toEqual([2500, 3500]);
    expect(next.walls.find(w => w.id === 'inner')!.b).toEqual([2500, 3500]);
  });
  it('两端都没有连接时自由平移', () => {
    const d = design();
    d.walls = [...d.walls, { id: 'free', kind: 'partition', a: [3500, 2000], b: [4500, 2000], thickness: 200 }];
    const w = moveWallWithJoints(d, 'free', [100, 200])!.walls.find(w => w.id === 'free')!;
    expect(w.a).toEqual([3600, 2200]);
  });
});

describe('改墙后交接点自动分割', () => {
  it('把一面墙平移到与另一面墙十字交叉，双方都被切开', () => {
    const d = design();
    const cross: Wall = { id: 'cross', kind: 'partition', a: [1000, 3000], b: [4000, 3000], thickness: 200 };
    d.walls = [...d.walls, cross];
    const next = splitAtJunctionsOf(d, ['cross']);
    expect(next.walls.filter(w => w.a[1] === 3000 && w.b[1] === 3000)).toHaveLength(2);
    expect(next.walls.filter(w => w.a[0] === 2500 && w.b[0] === 2500)).toHaveLength(2);
  });
  it('T 形：端点停在另一面墙身上，宿主墙被切成两段', () => {
    const d = design();
    d.walls = [...d.walls, { id: 'tee', kind: 'partition', a: [2500, 2000], b: [5000, 2000], thickness: 200 }];
    const next = splitAtJunctionsOf(d, ['tee']);
    expect(next.walls.filter(w => w.a[0] === 2500 && w.b[0] === 2500)).toHaveLength(2);
  });
});

describe('门窗与贴墙家具按到墙两端的净距定位', () => {
  it('门窗：改第 1 端净距，第 2 端随之变化；同时改宽度时净距仍准确', () => {
    const d = design();
    d.openings = [{ id: 'door', wallId: 'inner', kind: 'door', offset: 3000, width: 900 }];
    const s = { kind: 'opening' as const, id: 'door' };
    const p0 = wallPlacement(d, s)!;
    expect(p0.names).toEqual(['上', '下']);
    expect(placementGaps(p0)).toEqual([2550, 2550]);
    const moved = editSelection(d, s, { gapA: 1000 });
    expect(placementGaps(wallPlacement(moved, s)!)).toEqual([1000, 4100]);
    const both = editSelection(d, s, { width: 1200, gapB: 500 });
    expect(placementGaps(wallPlacement(both, s)!)).toEqual([4300, 500]);
    expect(() => editSelection(d, s, { gapA: 5500 })).toThrow('超出所在墙段范围');
  });
  it('贴墙家具：沿墙平移到指定净距，不贴墙的家具没有沿墙位置', () => {
    const d = design();
    d.furniture = [furn('cab', 2600 + 300, 3000, 1000, 600, 90), furn('free', 4000, 3000)];
    const s = { kind: 'furniture' as const, id: 'cab' };
    const next = editSelection(d, s, { gapA: 200 });
    expect(next.furniture.find(f => f.id === 'cab')).toMatchObject({ cx: 2900, cy: 700 });
    expect(wallPlacement(d, { kind: 'furniture', id: 'free' })).toBeNull();
  });
});

describe('墙延长 / 缩短时门窗留在原位', () => {
  const withWindow = () => {
    const d = design();
    d.openings = [{ id: 'win', wallId: 'inner', kind: 'window', offset: 3000, width: 900 }];
    return d;
  };
  const center = (d: Design) => {
    const o = d.openings[0]!, w = d.walls.find(w => w.id === o.wallId)!, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    return [w.a[0] + (w.b[0] - w.a[0]) * o.offset / L, w.a[1] + (w.b[1] - w.a[1]) * o.offset / L];
  };
  it('拖 A 端把墙延长：窗户的世界坐标不变', () => {
    const before = withWindow();
    const after = { ...before, walls: before.walls.map(w => w.id === 'inner' ? { ...w, a: [2500, -1500] as [number, number] } : w) };
    const next = keepOpeningsInPlace(before, after);
    expect(next.openings[0]!.offset).toBe(4500);
    expect(center(next)).toEqual(center(before));
  });
  it('拖 B 端延长：offset 不变；A 端缩短到切进窗户时判为放不下', () => {
    const before = withWindow();
    const longer = { ...before, walls: before.walls.map(w => w.id === 'inner' ? { ...w, b: [2500, 8000] as [number, number] } : w) };
    expect(keepOpeningsInPlace(before, longer)).toBe(longer);
    const cut = keepOpeningsInPlace(before, { ...before, walls: before.walls.map(w => w.id === 'inner' ? { ...w, a: [2500, 2800] as [number, number] } : w) });
    expect(openingsFitWalls(cut, ['inner'])).toBe(false);
  });
  it('连接墙被移动的墙带着从 A 端伸长时，墙上门窗留在原位', () => {
    const d = design();
    const arm: Wall = { id: 'arm', kind: 'partition', a: [2500, 3000], b: [6000, 3000], thickness: 200 };
    d.walls = [...d.walls, arm];
    d.openings = [{ id: 'door', wallId: 'arm', kind: 'door', offset: 2000, width: 900 }];
    const before = center(d);
    const next = moveWallWithJoints(d, 'inner', [-500, 0])!;
    expect(next.walls.find(w => w.id === 'arm')!.a).toEqual([2000, 3000]);
    expect(center(next)).toEqual(before);
  });
});

describe('编辑栏避开门窗距离标注', () => {
  const viewport = { width: 1200, height: 800 }, size = { width: 300, height: 48 };
  it('不传标注时结果与原来一致', () => {
    const object = { left: 500, top: 300, right: 560, bottom: 320 };
    expect(placeEditor(object, viewport, size, [])).toEqual(placeEditor(object, viewport, size, [], []));
  });
  it('原首选位置压住标注时改到不重叠的位置', () => {
    const object = { left: 500, top: 300, right: 560, bottom: 320 };
    const labels = [{ left: 300, top: 330, right: 490, bottom: 350 }, { left: 570, top: 330, right: 900, bottom: 350 }];
    const pos = placeEditor(object, viewport, size, [], labels)!;
    const r = { left: pos.x, top: pos.y, right: pos.x + size.width, bottom: pos.y + size.height };
    for (const l of labels) {
      const overlap = Math.max(0, Math.min(r.right, l.right) - Math.max(r.left, l.left)) * Math.max(0, Math.min(r.bottom, l.bottom) - Math.max(r.top, l.top));
      expect(overlap).toBe(0);
    }
    expect(r.right).toBeLessThanOrEqual(viewport.width);
    expect(r.bottom).toBeLessThanOrEqual(viewport.height);
  });
});
