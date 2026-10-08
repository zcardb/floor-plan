import { describe, expect, it } from 'vitest';
import { blankDesign, createProject, referenceDesign } from '../data/templates';
import { canDemolishWall, canEditWall, canResizeWall, isBearingWall, setWallBearing, wallKindName } from './wallPolicy';
import { rebuildRooms, resizeBlank } from './geometry';
import { calculateCosts } from './costs';
import { editSelection } from './selectionEdits';
import { createSizeTransaction } from './sizeTransaction';
import { createDrawingDocument } from './drawingDocument';
import type { Wall } from './types';
const partition: Wall = { id: 'partition', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240 };
const fixture = () => rebuildRooms({ ...blankDesign(), walls: [...blankDesign().walls, partition] });
describe('承重墙标记策略', () => {
  it('仅增加标记，不改变房间、面积、费用、导出几何和原类型', () => {
    const before = fixture(), next = setWallBearing(before, partition.id, true);
    expect(next.walls[next.walls.length - 1]).toEqual({ ...partition, loadBearing: true });
    expect(next.rooms).toBe(before.rooms); expect(next.openings).toBe(before.openings);
    expect(calculateCosts(next)).toEqual(calculateCosts(before));
    expect(rebuildRooms(next).rooms).toEqual(before.rooms);
    const layers = { grid: false, dims: true, labels: true, furn: true, bearing: true, snap: true };
    const geometry = (d: typeof before) => { const doc = createDrawingDocument(d, layers); return { ...doc, entities: doc.entities.map(({ group: _group, ...e }) => e) }; };
    expect(geometry(next)).toEqual(geometry(before));
    expect(canEditWall(next, next.walls[next.walls.length - 1]!)).toBe(false);
    expect(canDemolishWall(next.walls[next.walls.length - 1]!)).toBe(false);
    expect(setWallBearing(next, partition.id, true)).toBe(next);
    const restored = setWallBearing(next, partition.id, false);
    expect(canEditWall(restored, restored.walls[restored.walls.length - 1]!)).toBe(true);
  });
  it('保留既有洞口并保护墙尺寸及洞口尺寸', () => {
    const before = fixture(); before.openings.push({ id: 'door', wallId: partition.id, kind: 'door', offset: 2000, width: 900 });
    const next = setWallBearing(before, partition.id, true);
    expect(next.openings).toEqual(before.openings);
    expect(() => editSelection(next, { kind: 'wall', id: partition.id }, { length: 5000 })).toThrow('锁定');
    expect(() => editSelection(next, { kind: 'opening', id: 'door' }, { offset: 3000 })).toThrow('锁定');
    expect(editSelection(setWallBearing(next, partition.id, false), { kind: 'opening', id: 'door' }, { offset: 3000 }).openings[0].offset).toBe(3000);
  });
  it('原始承重、已拆墙和不存在的墙拒绝操作', () => {
    const demo = referenceDesign(), original = demo.walls.find(w => w.kind === 'bearing')!;
    expect(isBearingWall({ ...original, loadBearing: false })).toBe(true);
    expect(() => setWallBearing(demo, original.id, false)).toThrow('原始');
    expect(() => setWallBearing({ ...fixture(), demolished: [partition.id] }, partition.id, true)).toThrow('撤销');
    expect(() => setWallBearing(fixture(), 'missing', true)).toThrow('不存在');
  });
  it('外围墙/矮墙身份保留，户型调整不会丢失标记或绕过保护', () => {
    const before = blankDesign(), marked = setWallBearing(before, 'outer-0', true);
    expect(wallKindName(marked.walls[0])).toBe('外围墙');
    expect(resizeBlank(marked, marked.width, marked.depth, marked.thickness).walls[0].loadBearing).toBe(true);
    expect(() => resizeBlank(marked, 7000, 6000, 240)).toThrow('承重');
    expect(() => resizeBlank(marked, 6000, 6000, 300)).toThrow('承重');
    const inner = setWallBearing(fixture(), partition.id, true);
    expect(() => resizeBlank(inner, 2500, 6000, 240)).toThrow('边界');
    const low = { ...partition, kind: 'low' as const };
    const d = { ...blankDesign(), walls: [...before.walls, low] };
    expect(wallKindName(setWallBearing(d, low.id, true).walls[d.walls.length - 1]!)).toBe('矮墙');
  });
});

describe('复制/新建项目的结构解锁', () => {
  const unlocked = () => ({ ...referenceDesign(), structureUnlocked: true });
  it('未解锁的参考户型所有墙体仍锁定尺寸', () => {
    const d = referenceDesign();
    expect(d.walls.some(w => canResizeWall(d, w))).toBe(false);
  });
  it('解锁后外围、承重、矮墙、隔墙均可调尺寸，已拆墙除外', () => {
    const d = unlocked();
    for (const kind of ['exterior', 'bearing', 'low', 'partition'] as const) {
      const w = d.walls.find(w => w.kind === kind)!;
      expect(canResizeWall(d, w)).toBe(true);
    }
    const low = d.walls.find(w => w.kind === 'low')!;
    expect(canResizeWall({ ...d, demolished: [low.id] }, low)).toBe(false);
  });
  it('删除权限不随解锁放开', () => {
    const d = unlocked();
    expect(d.walls.some(w => canEditWall(d, w))).toBe(false);
  });
  it('空白户型的结果与原规则完全一致', () => {
    const d = { ...fixture(), structureUnlocked: true };
    for (const w of d.walls) expect(canResizeWall(d, w)).toBe(canEditWall(d, w));
  });
  it('解锁参考户型可改外墙长度，未解锁仍抛锁定', () => {
    const d = unlocked(), w = d.walls.find(w => w.id === 'w7')!;
    const next = editSelection(d, { kind: 'wall', id: w.id }, { thickness: 300 });
    expect(next.walls.find(x => x.id === w.id)!.thickness).toBe(300);
    expect(next.rooms.map(r => r.name)).toEqual(d.rooms.map(r => r.name));
    expect(() => editSelection(referenceDesign(), { kind: 'wall', id: w.id }, { thickness: 300 })).toThrow('锁定');
  });
  it('新建项目自动解锁结构', () => {
    expect(createProject('reference').state.structureUnlocked).toBe(true);
    expect(createProject('blank').state.structureUnlocked).toBe(true);
    expect(referenceDesign().structureUnlocked).toBeUndefined();
  });
  it('解锁墙体的尺寸边界仍按统一范围拒绝', () => {
    const d = unlocked(), w = d.walls.find(w => w.id === 'w7')!;
    const selection = { kind: 'wall' as const, id: w.id };
    expect(editSelection(d, selection, { thickness: 50 }).walls.find(x => x.id === w.id)!.thickness).toBe(50);
    expect(editSelection(d, selection, { thickness: 1000 }).walls.find(x => x.id === w.id)!.thickness).toBe(1000);
    expect(editSelection(d, selection, { length: 100 }).walls.find(x => x.id === w.id)).toBeDefined();
    for (const bad of [49, 1001, Number.NaN]) expect(() => editSelection(d, selection, { thickness: bad })).toThrow('允许范围');
    expect(() => editSelection(d, selection, { length: 50 })).toThrow('允许范围');
  });
  it('非法尺寸回滚预览且不提交，合法尺寸可撤销到原值', () => {
    const before = unlocked();
    let design = before;
    const transaction = createSizeTransaction(() => design, next => { design = next; }, (next, prev) => { design = next; expect(prev).toBe(before); });
    const w = before.walls.find(x => x.id === 'w7')!;
    const token = transaction.begin({ kind: 'wall', id: w.id });
    expect(() => transaction.update(token, { thickness: '3000' })).toThrow('允许范围');
    expect(design).toBe(before);
    transaction.update(token, { thickness: '300' });
    expect(design.walls.find(x => x.id === w.id)!.thickness).toBe(300);
    expect(transaction.apply(token)).toBe(true);
    expect(design.rooms.map(r => [r.id, r.name])).toEqual(before.rooms.map(r => [r.id, r.name]));
  });
});
