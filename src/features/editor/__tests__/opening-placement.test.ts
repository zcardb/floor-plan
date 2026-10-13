import { describe, expect, it } from 'vitest';
import { placeOpening } from '../model/opening-placement';
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
