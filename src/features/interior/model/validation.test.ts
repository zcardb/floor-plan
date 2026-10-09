import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { validateDesign } from './validation';
import { setWallBearing } from './wallPolicy';
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
});
