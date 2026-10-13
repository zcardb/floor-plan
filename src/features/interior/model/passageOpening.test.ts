import { describe, expect, it } from 'vitest';
import { referenceDesign } from '../data/templates';
import { openingDimensions, calculateCosts } from './costs';
import { createDrawingDocument } from './drawingDocument';
import { validateDesign } from './validation';
import { editSelection } from './selectionEdits';
import { builtinCostEntries } from './accountCostEntries';
import { openingName, validCustomOpening } from './hardMaterials';
import type { Design, Opening } from './types';

/** 参考户型：在厨房 / 餐厅之间的隔墙（x≈2300，y 4430→5796）上开一个 1.2 m 垭口。 */
function withPassage(extra: Partial<Opening> = {}): { design: Design; passage: Opening } {
  const d = referenceDesign();
  const wall = d.walls.find(w => w.a[0] === 2300 && w.a[1] === 4430 && w.b[1] === 5796)!;
  const passage: Opening = { id: 'passage', wallId: wall.id, kind: 'passage', offset: 683, width: 1200, ...extra };
  return { design: { ...d, openings: [...d.openings, passage] }, passage };
}

describe('垭口', () => {
  it('只有宽高与位置：离地高度恒为 0，默认高 2.1 m，面积 = 宽 × 高', () => {
    const { design, passage } = withPassage();
    expect(openingDimensions(passage, design)).toEqual({ sill: 0, height: 2100, area: 1.2 * 2.1 });
    // 即使数据里带了 sill，也不会抬高洞口
    expect(openingDimensions({ ...passage, sill: 900 }, design).sill).toBe(0);
    expect(openingName(design, passage)).toBe('垭口');
  });
  it('含垭口的方案能通过校验；未知开口类型仍被拒绝', () => {
    const { design } = withPassage();
    expect(() => validateDesign(design)).not.toThrow();
    const bad = { ...design, openings: [...design.openings.slice(0, -1), { ...design.openings[design.openings.length - 1]!, kind: 'arch' }] };
    expect(() => validateDesign(bad)).toThrow();
  });
  it('导出两条贯穿墙厚的边线 + 两条虚线过梁，没有门扇弧线，归入门图层', () => {
    const { design } = withPassage();
    const doc = createDrawingDocument(design, { grid: false, dims: false, labels: false, furn: false, bearing: false, snap: false });
    const own = doc.entities.filter(e => e.group?.id === 'passage');
    expect(own).toHaveLength(4);
    expect(own.every(e => e.kind === 'polyline' && e.layer === 'DOORS')).toBe(true);
    expect(own.filter(e => e.kind === 'polyline' && e.dashed)).toHaveLength(2);
    expect(own[0]!.group!.name).toBe('垭口');
  });
  it('两侧房间保持独立，费用中出现垭口条目', () => {
    const { design } = withPassage();
    expect(design.rooms.map(r => r.name)).toEqual(expect.arrayContaining(['厨房', '餐厅']));
    const costs = calculateCosts(design);
    expect(costs.hard.some(row => row.group === 'openingPrices' && row.key === 'passage')).toBe(true);
    expect(builtinCostEntries().some(e => e.group === 'openingPrices' && e.key === 'passage' && e.name === '垭口')).toBe(true);
  });
  it('高度超过层高时拒绝修改', () => {
    const { design } = withPassage();
    expect(() => editSelection(design, { kind: 'opening', id: 'passage' }, { height: 3000 })).toThrow('层高');
  });
  it('自定义垭口款式可通过校验', () => {
    expect(validCustomOpening({ key: 'custom-11111111-1111-4111-8111-111111111111', name: '实木垭口', kind: 'passage', width: 1200, height: 2100, price: 300 })).toBe(true);
  });
});
