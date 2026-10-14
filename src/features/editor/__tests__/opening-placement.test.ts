import { describe, expect, it } from 'vitest';
import { canDuplicateOpening, duplicateOpening, placeOpening } from '../model/opening-placement';
import { blankDesign } from '@/lib/floor-plan/templates';
import type { Opening, Wall } from '@/lib/floor-plan/types';

const wall = (len: number): Wall => ({ id: 'w', a: [0, 0], b: [len, 0], thickness: 120, kind: 'partition' });
const opening = (offset: number, width: number, wallId = 'w'): Opening => ({ id: `o${offset}`, wallId, kind: 'door', offset, width });

describe('在墙上新增门窗', () => {
  it('默认宽度放得下：宽度不变，贴近点击处并夹在墙内', () => {
    expect(placeOpening({ openings: [] }, wall(4000), 'window', 2000)).toEqual({ ok: true, width: 1200, offset: 2000, fitted: false });
    expect(placeOpening({ openings: [] }, wall(4000), 'window', 100)).toEqual({ ok: true, width: 1200, offset: 600, fitted: false });
  });
  it.each(['window', 'door'] as const)('%s 在 1 米墙上自动缩到墙段最大宽度并居中', kind => {
    const placed = placeOpening({ openings: [] }, wall(kind === 'door' ? 800 : 1000), kind, 300);
    expect(placed).toEqual({ ok: true, width: kind === 'door' ? 800 : 1000, offset: kind === 'door' ? 400 : 500, fitted: true });
  });
  it('宽度取整到厘米，保证一定放得下', () => {
    expect(placeOpening({ openings: [] }, wall(1004.6), 'window', 500)).toMatchObject({ width: 1000, fitted: true });
  });
  it('与相邻门窗之间的空档不够时，缩到空档宽度；空档够时平移进空档而不是报重叠', () => {
    const openings = [opening(500, 1000), opening(3000, 1000)]; // 占 0–1000、2500–3500
    expect(placeOpening({ openings }, wall(6000), 'window', 1800)).toEqual({ ok: true, width: 1200, offset: 1800, fitted: false });
    // 贴着左边门点击：平移进空档（1000 + 600），不报重叠
    expect(placeOpening({ openings }, wall(6000), 'window', 1100)).toEqual({ ok: true, width: 1200, offset: 1600, fitted: false });
    const tight = [opening(500, 1000), opening(2400, 1000)]; // 空档 1000–1900
    expect(placeOpening({ openings: tight }, wall(6000), 'window', 1500)).toEqual({ ok: true, width: 900, offset: 1450, fitted: true });
    // 其他墙上的门窗不参与
    expect(placeOpening({ openings: [opening(500, 1000, 'other')] }, wall(6000), 'window', 500)).toMatchObject({ width: 1200, offset: 600 });
  });
  it('点在已有门窗上、空档小于 10cm 时不放；垭口不自动缩', () => {
    expect(placeOpening({ openings: [opening(500, 1000)] }, wall(4000), 'window', 500)).toEqual({ ok: false, reason: '门窗不能重叠' });
    expect(placeOpening({ openings: [] }, wall(80), 'door', 40)).toEqual({ ok: false, reason: '此墙段长度不足' });
    expect(placeOpening({ openings: [] }, wall(1000), 'passage', 500)).toEqual({ ok: false, reason: '此墙段长度不足' });
    expect(placeOpening({ openings: [opening(500, 1000), opening(2400, 1000)] }, wall(6000), 'passage', 1500)).toEqual({ ok: false, reason: '门窗不能重叠' });
  });
});

describe('复制门窗', () => {
  const design = (len: number, openings: Opening[]) => ({ ...blankDesign(), walls: [wall(len)], openings });
  const copyOf = (r: ReturnType<typeof duplicateOpening>) => (r.ok ? r.design.openings.find(o => o.id === r.id)! : null);
  it('复制件保留全部属性，放在同墙最近的空位（同样近时优先右侧），不与原件重叠', () => {
    const source: Opening = { ...opening(2000, 1000), kind: 'window', sill: 900, height: 1500, variant: 'v1' };
    const r = duplicateOpening(design(6000, [source]), source.id, 'copy');
    expect(r).toMatchObject({ ok: true, id: 'copy', fitted: false });
    expect(copyOf(r)).toEqual({ ...source, id: 'copy', offset: 3000 });
    expect(r.ok && r.design.openings).toHaveLength(2);
  });
  it('右侧放不下时放到左侧', () => {
    const r = duplicateOpening(design(4000, [opening(3000, 1000)]), 'o3000', 'copy');
    expect(copyOf(r)).toMatchObject({ offset: 2000, width: 1000, kind: 'door' });
  });
  it('没有放得下原宽度的空档时缩到最大空档并居中；空档不足 10cm 不复制', () => {
    const r = duplicateOpening(design(1800, [opening(500, 1000)]), 'o500', 'copy');
    expect(r).toMatchObject({ ok: true, fitted: true });
    expect(copyOf(r)).toMatchObject({ offset: 1400, width: 800 });
    expect(duplicateOpening(design(1050, [opening(500, 1000)]), 'o500', 'copy')).toEqual({ ok: false, reason: '这面墙上没有空位放复制的门' });
  });
  it('垭口不能复制', () => {
    const passage: Opening = { ...opening(1000, 900), kind: 'passage' };
    expect(canDuplicateOpening(passage)).toBe(false);
    expect(canDuplicateOpening(opening(1000, 900))).toBe(true);
    expect(duplicateOpening(design(6000, [passage]), passage.id, 'copy').ok).toBe(false);
  });
});
