import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { applyRoomCeiling, applyRoomRoof, pickableSurfaces, roofSurfaceArea, setRoomRoofSlope } from './hardMaterials';
import { calculateCosts, setPrice } from './costs';
import { costBreakdown } from './costBreakdown';
import { area } from './geometry';
import { validateDesign } from './validation';
import { accountCostEntries, accountCostSource } from './accountCostEntries';
import { createDrawingDocument } from './drawingDocument';
import type { CustomWall, Design, Layers } from './types';

const tile: CustomWall = { key: 'custom-55555555-5555-4555-8555-555555555555', name: '仿古琉璃瓦', color: '#3f6b8c', price: 160 };
const board: CustomWall = { key: 'custom-66666666-6666-4666-8666-666666666666', name: '双层石膏板', color: '#f3f1ec', price: 90 };
const layers: Layers = { grid: false, dims: true, labels: true, furn: true, bearing: true, snap: false };
const withSurfaces = (): Design => {
  const d = blankDesign(), id = d.rooms[0].id;
  return setRoomRoofSlope(applyRoomCeiling(applyRoomRoof(d, id, tile.key, [tile]), id, board.key, [board]), id, 30);
};

describe('屋面与吊顶（按房间计入硬装）', () => {
  it('屋面面积 = 房间面积 ÷ cos(坡度)，平顶等于房间面积；吊顶按房间面积', () => {
    const r = blankDesign().rooms[0];
    expect(roofSurfaceArea({ ...r, roofSlope: 0 })).toBeCloseTo(area(r));
    expect(roofSurfaceArea({ ...r, roofSlope: 30 })).toBeCloseTo(area(r) / Math.cos(Math.PI / 6));
    const rows = calculateCosts(withSurfaces()).hard;
    expect(rows.find(x => x.group === 'roofPrices')).toMatchObject({ key: tile.key, name: '仿古琉璃瓦', price: 160 });
    expect(rows.find(x => x.group === 'roofPrices')!.quantity).toBeCloseTo(area(r) / Math.cos(Math.PI / 6));
    expect(rows.find(x => x.group === 'ceilingPrices')!.quantity).toBeCloseTo(area(r));
  });
  it('旧项目与未设置的房间不产生屋面 / 吊顶行', () => {
    const rows = calculateCosts(blankDesign()).hard;
    expect(rows.some(x => x.group === 'roofPrices' || x.group === 'ceilingPrices')).toBe(false);
  });
  it('房间明细里归属本间，不进公共项，合计守恒', () => {
    const d = setPrice(withSurfaces(), 'ceilingPrices', board.key, 100), b = costBreakdown(d);
    const room = b.rooms.find(r => r.roomId === d.rooms[0].id)!;
    expect(room.hard.map(p => p.group)).toEqual(expect.arrayContaining(['roofPrices', 'ceilingPrices']));
    expect(b.shared.some(p => p.group === 'roofPrices' || p.group === 'ceilingPrices')).toBe(false);
    expect(b.roomTotal + b.sharedTotal).toBeCloseTo(b.total, 1);
  });
  it('账号库材料首次选用时写入项目，清除后保留材料定义', () => {
    const d = blankDesign(), id = d.rooms[0].id;
    expect(pickableSurfaces(d, 'roof', [tile]).find(x => x.key === tile.key)?.fromAccount).toBe(true);
    const next = applyRoomRoof(d, id, tile.key, [tile]);
    expect(next.customRoofs).toEqual([tile]);
    expect(d.customRoofs).toBeUndefined();
    const cleared = applyRoomRoof(setRoomRoofSlope(next, id, 20), id, null, []);
    expect(cleared.rooms[0].roofMat).toBeUndefined();
    expect(cleared.rooms[0].roofSlope).toBeUndefined();
    expect(() => applyRoomCeiling(d, id, board.key, [])).toThrow();
  });
  it('坡度 0 与 60 合法，越界被拒绝；校验截断越界坡度并清除未知材料', () => {
    const d = withSurfaces(), id = d.rooms[0].id;
    expect(setRoomRoofSlope(d, id, 0).rooms[0].roofSlope).toBe(0);
    expect(setRoomRoofSlope(d, id, 60).rooms[0].roofSlope).toBe(60);
    expect(() => setRoomRoofSlope(d, id, 61)).toThrow();
    expect(() => setRoomRoofSlope(d, id, -5)).toThrow();
    expect(validateDesign({ ...d, rooms: d.rooms.map(r => ({ ...r, roofSlope: 75 })) }).rooms[0].roofSlope).toBe(60);
    expect(validateDesign({ ...d, rooms: d.rooms.map(r => ({ ...r, roofSlope: -5 })) }).rooms[0].roofSlope).toBe(0);
    const unknown = validateDesign({ ...blankDesign(), rooms: blankDesign().rooms.map(r => ({ ...r, roofMat: tile.key, roofSlope: 20, ceilingMat: board.key })) }).rooms[0];
    expect(unknown.roofMat).toBeUndefined();
    expect(unknown.roofSlope).toBeUndefined();
    expect(unknown.ceilingMat).toBeUndefined();
    expect(validateDesign(d).rooms[0]).toMatchObject({ roofMat: tile.key, roofSlope: 30, ceilingMat: board.key });
  });
  it('账号库条目归入硬装屋面 / 吊顶并标注来源', () => {
    const entries = accountCostEntries([], {}, [], [], [], { roofs: [tile], ceilings: [board] });
    expect(entries.filter(e => e.category === '屋面').map(e => e.name)).toEqual(['仿古琉璃瓦', '琉璃瓦', '水泥瓦', '沥青瓦', '树脂瓦', '石板瓦', '现浇混凝土平屋面（含防水保温）', '彩钢瓦', '阳光板']);
    expect(entries.filter(e => e.category === '吊顶').map(e => e.name)).toEqual(['双层石膏板', '石膏板吊顶', '铝扣板吊顶', '集成吊顶']);
    expect(entries.filter(e => e.category === '屋面' || e.category === '吊顶').every(e => e.major === '硬装')).toBe(true);
    const d = withSurfaces();
    expect(accountCostSource(d, { group: 'roofPrices', key: tile.key })).toBe('账号屋面库');
    expect(accountCostSource(d, { group: 'ceilingPrices', key: board.key })).toBe('账号吊顶库');
  });
  it('没有屋面就没有吊顶：不能单独设吊顶，清除屋面一并清除吊顶，不计吊顶费用', () => {
    const d = blankDesign(), id = d.rooms[0].id;
    expect(() => applyRoomCeiling(d, id, 'gypsum', [])).toThrow('请先设置屋面');
    const full = withSurfaces(), cleared = applyRoomRoof(full, full.rooms[0].id, null, []);
    expect(cleared.rooms[0].ceilingMat).toBeUndefined();
    const orphan = { ...d, rooms: d.rooms.map(r => ({ ...r, ceilingMat: 'gypsum' })) };
    expect(calculateCosts(orphan).hard.some(x => x.group === 'ceilingPrices')).toBe(false);
    expect(validateDesign(orphan).rooms[0].ceilingMat).toBeUndefined();
  });
  it('平面图纸不含屋面 / 吊顶内容', () => {
    const doc = JSON.stringify(createDrawingDocument(withSurfaces(), layers));
    expect(doc).not.toContain('仿古琉璃瓦');
    expect(doc).not.toContain('双层石膏板');
  });
});
