import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { validateDesign } from './validation';
import { setWallBearing } from './wallPolicy';
import type { Point } from './types';
describe('承重标记方案兼容性', () => {
  it('旧 Demo 和空白项目无需迁移', () => {
    expect(validateDesign(blankDesign()).version).toBe(2);
    expect(validateDesign(referenceDesign()).template).toBe('reference');
  });
  it('JSON 往返保留外围承重标记和原字段', () => {
    const d = setWallBearing(blankDesign(), 'outer-0', true);
    expect(validateDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('结构解锁标记：布尔与缺省通过，其它类型拒绝', () => {
    expect(validateDesign({ ...referenceDesign(), structureUnlocked: true }).structureUnlocked).toBe(true);
    expect(validateDesign(referenceDesign()).structureUnlocked).toBeUndefined();
    for (const invalid of ['yes', 1, null]) expect(() => validateDesign({ ...referenceDesign(), structureUnlocked: invalid })).toThrow();
  });
  it('非布尔字段拒绝；承重墙上的旧拆除标记加载时连墙删除，不改原对象', () => {
    const d = blankDesign();
    for (const invalid of ['true', 1, null]) expect(() => validateDesign({ ...d, walls: d.walls.map(w => ({ ...w, loadBearing: invalid })) })).toThrow();
    d.walls.push({ id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240, loadBearing: true });
    const legacy = { ...d, demolished: ['inner'] };
    const next = validateDesign(legacy);
    expect(next.walls.some(w => w.id === 'inner')).toBe(false); expect(next.demolished).toEqual([]);
    expect(legacy.demolished).toEqual(['inner']); expect(legacy.walls.some(w => w.id === 'inner')).toBe(true);
  });
  it('旧项目加载时补齐分隔线并按墙重算房间：轮廓里的墙带碎洞消失，名称与 id 保留', () => {
    const { separators: _omit, ...legacy } = blankDesign();
    const room = legacy.rooms[0]!;
    const hole: Point[] = [[3000, 3000], [3000, 3350], [3120, 3350], [3120, 3000]];
    const withHole = { ...legacy, rooms: [{ ...room, rings: [...room.rings, hole] }] };
    const loaded = validateDesign(JSON.parse(JSON.stringify(withHole)));
    expect(loaded.separators).toEqual([]);
    expect(loaded.rooms).toHaveLength(1);
    expect(loaded.rooms[0]!.rings).toHaveLength(1);
    expect([loaded.rooms[0]!.id, loaded.rooms[0]!.name]).toEqual([room.id, room.name]);
    expect(validateDesign(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
  });
  it('分隔线格式错误时拒绝加载', () => {
    const d = blankDesign();
    expect(() => validateDesign({ ...d, separators: [{ id: 's', a: [0, 0], b: [5, 0] }] })).toThrow();
    expect(() => validateDesign({ ...d, separators: [{ id: 's', a: [0, 0] }] })).toThrow();
    expect(validateDesign({ ...d, separators: [{ id: 's', a: [0, 0], b: [500, 0] }] }).separators).toHaveLength(1);
  });
});

describe('家具组合字段', () => {
  const withGroup = (groupId: unknown) => ({ ...blankDesign(), furniture: [{ id: 'f1', type: 'chair', name: '餐椅', cx: 1000, cy: 1000, w: 450, d: 500, rot: 0, color: '#efe6d8', groupId }] });
  it('合法的 groupId 保存后仍保留', () => {
    const d = withGroup('g1');
    expect(validateDesign(JSON.parse(JSON.stringify(d))).furniture[0]!.groupId).toBe('g1');
  });
  it('非字符串或空 groupId 视为格式错误', () => {
    expect(() => validateDesign(withGroup(3))).toThrow();
    expect(() => validateDesign(withGroup(''))).toThrow();
  });
});
