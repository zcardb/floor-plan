import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { applyOpeningVariant, applyRoomWall, pickableWalls } from './hardMaterials';
import { calculateCosts } from './costs';
import { validateDesign } from './validation';
import { accountCostEntries, accountCostSource } from './accountCostEntries';
import type { CustomOpening, CustomWall, Design } from './types';

const wall: CustomWall = { key: 'custom-33333333-3333-4333-8333-333333333333', name: '艺术涂料', color: '#d9cbb6', price: 120 };
const door: CustomOpening = { key: 'custom-44444444-4444-4444-8444-444444444444', name: '实木门', kind: 'door', width: 1000, height: 2200, price: 800 };
const withDoor = (): Design => { const d = blankDesign(); d.openings.push({ id: 'o', wallId: d.walls[0].id, kind: 'door', offset: 2000, width: 900 }); return d; };

describe('自定义墙面与门窗', () => {
  it('账号库墙面首次选用时写入项目并参与成本', () => {
    const d = blankDesign();
    expect(pickableWalls(d, [wall]).find(w => w.key === wall.key)?.fromAccount).toBe(true);
    const next = applyRoomWall(d, d.rooms[0].id, wall.key, [wall]);
    expect(next.customWalls).toEqual([wall]);
    const row = calculateCosts(next).hard.find(r => r.group === 'wallPrices' && r.key === wall.key);
    expect(row?.name).toBe('艺术涂料');
    expect(row?.price).toBe(120);
    expect(() => validateDesign(next)).not.toThrow();
  });
  it('门窗款式按自身单价与名称计价，标准门不变', () => {
    const { design, widthKept } = applyOpeningVariant(withDoor(), 'o', door.key, [door]);
    expect(widthKept).toBe(false);
    expect(design.openings[0]).toMatchObject({ variant: door.key, width: 1000, height: 2200 });
    const rows = calculateCosts(design).hard.filter(r => r.group === 'openingPrices');
    expect(rows).toEqual([expect.objectContaining({ key: door.key, name: '实木门', price: 800 })]);
    const back = applyOpeningVariant(design, 'o', null, [door]).design;
    expect(back.openings[0].variant).toBeUndefined();
    expect(calculateCosts(back).hard.find(r => r.group === 'openingPrices')).toMatchObject({ key: 'door', name: '门' });
  });
  it('墙段放不下或会重叠时保留原宽', () => {
    const d = withDoor();
    d.openings.push({ id: 'n', wallId: d.walls[0].id, kind: 'window', offset: 2980, width: 1000 });
    const result = applyOpeningVariant(d, 'o', door.key, [door]);
    expect(result.widthKept).toBe(true);
    expect(result.design.openings[0].width).toBe(900);
  });
  it('款式类型不一致时拒绝', () => {
    expect(() => applyOpeningVariant(withDoor(), 'o', door.key, [{ ...door, kind: 'window' }])).toThrow();
  });
  it('校验拒绝未知墙面与类型不一致的款式，旧项目通过', () => {
    const d = blankDesign();
    expect(() => validateDesign(d)).not.toThrow();
    expect(() => validateDesign({ ...d, rooms: d.rooms.map(r => ({ ...r, wallMat: wall.key })) })).toThrow();
    const mismatched = withDoor();
    mismatched.customOpenings = [{ ...door, kind: 'window' }];
    mismatched.openings[0].variant = door.key;
    expect(() => validateDesign(mismatched)).toThrow();
  });
  it('账号条目包含自定义墙面与门窗及来源', () => {
    const entries = accountCostEntries([], {}, [], [wall], [door]);
    expect(entries.filter(e => e.category === '墙面').map(e => e.name)).toEqual(['艺术涂料', '乳胶漆', '墙纸', '墙砖']);
    expect(entries.filter(e => e.category === '门窗').map(e => e.name)).toEqual(['实木门', '门', '窗']);
    const design = { ...blankDesign(), customWalls: [wall], customOpenings: [door] };
    expect(accountCostSource(design, { group: 'wallPrices', key: wall.key })).toBe('账号墙面库');
    expect(accountCostSource(design, { group: 'openingPrices', key: door.key })).toBe('账号门窗库');
  });
});
