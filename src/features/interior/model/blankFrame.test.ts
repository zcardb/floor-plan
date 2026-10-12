import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { area, rect } from './geometry';
import { BLANK_FRAME_CHANGED, blankFrameIntact, resizeBlank } from './blankFrame';
import { deriveRooms } from './roomDerive';
import { syncRooms } from './roomFollow';
import { moveWallWithJoints } from './wallMove';
import { editSelection } from './selectionEdits';
import { canResizeWall, setWallBearing } from './wallPolicy';
import type { Design, Wall } from './types';

const partition: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240 };
const fixture = (): Design => deriveRooms({ ...blankDesign(), walls: [...blankDesign().walls, partition] });
/** 旧算法：外框矩形减去隔墙带。 */
const totalArea = (d: Design) => d.rooms.reduce((s, r) => s + area(r), 0);

describe('空白户型：房间按实际墙体轮廓重算', () => {
  it('外围墙未动时结果与外框矩形一致', () => {
    const d = deriveRooms(blankDesign());
    expect(d.rooms).toHaveLength(1);
    expect(area(d.rooms[0]!)).toBeCloseTo(area({ id: 'x', name: '', mat: 'wood', rings: [rect(0, 0, d.width, d.depth)] }), 6);
    const split = fixture();
    expect(split.rooms).toHaveLength(2);
    expect(totalArea(split)).toBeCloseTo((split.width * split.depth - 240 * split.depth) / 1e6, 3);
  });
  it('外围墙可调尺寸；承重标记后锁定', () => {
    const d = fixture();
    for (const w of d.walls) expect(canResizeWall(d, w)).toBe(true);
    const marked = setWallBearing(d, 'outer-1', true);
    expect(canResizeWall(marked, marked.walls.find(w => w.id === 'outer-1')!)).toBe(false);
  });
  it('向外拖动右侧外围墙：房间变大，id 与名称保留，连接墙随之伸缩', () => {
    const before = fixture();
    const moved = moveWallWithJoints(before, 'outer-1', [1000, 0]);
    expect(moved).not.toBeNull();
    const next = syncRooms(before, moved!);
    expect(next.rooms.map(r => r.id).sort()).toEqual(before.rooms.map(r => r.id).sort());
    expect(next.rooms.map(r => r.name).sort()).toEqual(before.rooms.map(r => r.name).sort());
    expect(totalArea(next) - totalArea(before)).toBeCloseTo(before.depth * 1000 / 1e6, 3);
    const top = next.walls.find(w => w.id === 'outer-0')!;
    expect(Math.max(top.a[0], top.b[0])).toBeCloseTo(before.width + before.thickness / 2 + 1000, 6);
  });
  it('通过尺寸面板改外围墙厚度，房间随墙面收缩', () => {
    const before = fixture();
    const next = editSelection(before, { kind: 'wall', id: 'outer-3' }, { thickness: 440 });
    expect(next.walls.find(w => w.id === 'outer-3')!.thickness).toBe(440);
    expect(totalArea(next)).toBeLessThan(totalArea(before));
    expect(next.rooms).toHaveLength(2);
  });
  it('外围墙单独调整后不能整体重设外围尺寸；参数不变时原样返回', () => {
    const d = fixture();
    expect(blankFrameIntact(d)).toBe(true);
    const moved = syncRooms(d, moveWallWithJoints(d, 'outer-1', [500, 0])!);
    expect(blankFrameIntact(moved)).toBe(false);
    expect(resizeBlank(moved, moved.width, moved.depth, moved.thickness)).toBe(moved);
    expect(() => resizeBlank(moved, moved.width + 10, moved.depth, moved.thickness)).toThrow(BLANK_FRAME_CHANGED);
    const thick = editSelection(d, { kind: 'wall', id: 'outer-0' }, { thickness: 300 });
    expect(blankFrameIntact(thick)).toBe(false);
    expect(() => resizeBlank(thick, thick.width, thick.depth, thick.thickness + 10)).toThrow(BLANK_FRAME_CHANGED);
  });
});
