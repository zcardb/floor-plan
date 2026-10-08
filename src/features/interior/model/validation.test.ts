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
  it('非布尔字段和承重墙拆除冲突拒绝，不清理原数据', () => {
    const d = blankDesign();
    for (const invalid of ['true', 1, null]) expect(() => validateDesign({ ...d, walls: d.walls.map(w => ({ ...w, loadBearing: invalid })) })).toThrow();
    d.walls.push({ id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240, loadBearing: true });
    const conflict = { ...d, demolished: ['inner'] };
    expect(() => validateDesign(conflict)).toThrow(); expect(conflict.demolished).toEqual(['inner']);
  });
});
