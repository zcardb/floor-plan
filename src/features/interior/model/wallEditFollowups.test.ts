import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { rect } from './geometry';
import { clearRoomFurniture, dropOrphanFurniture } from './roomFurniture';
import { followWallFurniture } from './furnitureFollow';
import { moveWallWithJoints } from './wallMove';
import { splitAtJunctionsOf } from './wallAutoSplit';
import { placeEditor } from './selectionAnchor';
import { editSelection } from './selectionEdits';
import { placementGaps, wallPlacement } from './wallPlacement';
import { keepOpeningsInPlace, openingsFitWalls } from './openingAnchor';
import { dragStep, stepDelta } from './dragStep';
import { deriveRooms } from './roomDerive';
import { fitFurnitureIntoRoom, fitsInRoom } from './roomFit';
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

describe('清空房间家具', () => {
  it('只删该房间内的家具，房间、墙与其他房间的家具不变', () => {
    const before = design(), next = clearRoomFurniture(before, 'left');
    expect(next.rooms).toBe(before.rooms);
    expect(next.furniture.map(f => f.id)).toEqual(['in-right']);
    expect(next.walls).toBe(before.walls);
  });
  it('房间里没有家具时原样返回', () => {
    const d = { ...design(), furniture: [] };
    expect(clearRoomFurniture(d, 'left')).toBe(d);
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

describe('拖动步进', () => {
  it('默认 5 cm；按图纸 x / y 取整位移', () => {
    expect(dragStep({})).toBe(50);
    expect(stepDelta([74, -26], 50)).toEqual([50, -50]);
  });
  it('给出墙方向时沿墙 / 垂直墙分别取整（斜墙也整步移动）', () => {
    const s = Math.SQRT1_2, d = stepDelta([80 * s, 80 * s], 50, [s, s]);
    // 沿墙 80 → 100，垂直墙 0 → 0。
    expect(d[0]).toBeCloseTo(100 * s);
    expect(d[1]).toBeCloseTo(100 * s);
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

describe('墙围出的空白区域自动成为房间', () => {
  // 外框 6000 × 6000，左右两间各占 y 0–6000；加一面横墙把右间下半截隔开。
  const withCut = (): Design => {
    const d = design();
    d.walls = [...d.walls, { id: 'cut', kind: 'partition', a: [2500, 4000], b: [6000, 4000], thickness: 200 }];
    d.rooms = [d.rooms[0]!, { ...d.rooms[1]!, rings: [rect(2600, 0, 3400, 3900)] }];
    return d;
  };
  it('之前不属于任何房间的区域补成「房间 n」，已有房间保留 id 与名称', () => {
    const before = withCut(), next = deriveRooms(before);
    expect(next.rooms.map(r => r.id).slice(0, 2)).toEqual(['left', 'right']);
    expect(next.rooms).toHaveLength(3);
    const added = next.rooms[2]!;
    expect(added.name).toBe('房间 1');
    const xs = added.rings[0]!.map(p => p[0]), ys = added.rings[0]!.map(p => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(2600);
    expect(Math.min(...ys)).toBeCloseTo(4100);
    expect(Math.max(...ys)).toBeCloseTo(6000);
  });
  it('房间已与墙一致时原样返回', () => {
    const d = deriveRooms(design());
    expect(deriveRooms(d)).toBe(d);
  });
});

describe('视觉上相接的墙按连接划分房间', () => {
  it('隔墙端头离墙差几厘米也把房间拆成两个', () => {
    const d = design();
    // 右间加一面横墙，右端离外墙内表面差 40 mm（视觉上已相接）。
    d.walls = [...d.walls, { id: 'cut', kind: 'partition', a: [2500, 3000], b: [5960, 3000], thickness: 120 }];
    const next = deriveRooms(d);
    expect(next.rooms).toHaveLength(3);
    expect(next.rooms[1]!.id).toBe('right');
    expect(next.rooms[2]!.name).toBe('客厅 2');
  });
  it('墙离得远（真实开口）时不拆', () => {
    const d = design();
    d.walls = [...d.walls, { id: 'cut', kind: 'partition', a: [2500, 3000], b: [5000, 3000], thickness: 120 }];
    expect(deriveRooms(d).rooms).toHaveLength(2);
  });
});

describe('家具收进目标房间', () => {
  const lRoom = { id: 'l', name: 'L', mat: 'wood', rings: [[[0, 0], [4000, 0], [4000, 2000], [2000, 2000], [2000, 4000], [0, 4000]] as [number, number][]] };
  const sofa = (cx: number, cy: number) => ({ id: 's', type: 'sofa', name: '沙发', cx, cy, w: 1800, d: 800, rot: 0, color: '#aaa' });
  it('落在 L 形缺口里的家具平移回房间内', () => {
    const { furniture, moved } = fitFurnitureIntoRoom([sofa(3000, 3000)], lRoom);
    expect(moved).toBe(1);
    expect(fitsInRoom(furniture[0]!, lRoom)).toBe(true);
  });
  it('本来就在房间里的不动；哪儿都放不下的不摆', () => {
    expect(fitFurnitureIntoRoom([sofa(1000, 1000)], lRoom).furniture[0]).toMatchObject({ cx: 1000, cy: 1000 });
    const huge = { ...sofa(1000, 1000), w: 5000, d: 5000 };
    expect(fitFurnitureIntoRoom([huge], lRoom)).toMatchObject({ furniture: [], dropped: 1 });
  });
});
