import { describe, expect, it } from 'vitest';
import { categories, library } from '@/lib/floor-plan/catalog';
import { blankDesign, referenceDesign } from '@/lib/floor-plan/templates';
import { countBy } from '@/lib/paging';
import { accountCatalog, accountCostSource, accountItemEntry, builtinCostEntries, costCategories, costCounts, costUnit, CUSTOM_CATEGORY, filterCostEntries } from '../model/account-cost-entries';
import { setPrice, priceOf } from '@/lib/floor-plan/costs';
import type { LibraryItem } from '@/lib/floor-plan/types';

const entries = builtinCostEntries();
const stairCount = library.filter(item => item.type === 'stairs').length;
const floor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '混凝土浇筑', pattern: 'seamless' as const, color: '#b8b8b0', price: 90 };
describe('账号成本分类与清单', () => {
  it('五类硬装材料 + 楼梯，并复用家具分类，不含施工', () => {
    expect(costCategories).toEqual(['地面', '墙面', '门窗', '屋面', '吊顶', '楼梯', ...categories]);
    expect(entries.some(entry => entry.group === 'constructionPrices')).toBe(false);
    expect(entries).toHaveLength(25 + library.length);
    expect(entries.find(entry => entry.key === library[0].catalogId)?.category).toBe(library[0].category);
  });
  it('内置条目按管理页的分类顺序排好：硬装各类在前，软装按家具分类', () => {
    const order = [...new Set(entries.map(entry => entry.category))];
    expect(order).toEqual(costCategories.filter(category => order.includes(category)));
    expect(entries.every(entry => !entry.account)).toBe(true);
  });
  it('楼梯归入硬装 · 楼梯，按件计价；旧账号副本即使分类是客厅也按楼梯归类', () => {
    const stairs = filterCostEntries(entries, '楼梯', '', '硬装');
    expect(stairs).toHaveLength(stairCount);
    expect(stairs.every(entry => entry.group === 'furniturePrices' && entry.unit === '件')).toBe(true);
    const legacy = accountItemEntry({ kind: 'furniture', item: { catalogId: 'custom-stairs', category: '客厅', type: 'stairs', name: '旧楼梯', w: 1000, d: 3000, color: '#eee' } });
    expect(legacy).toMatchObject({ key: 'custom-stairs', category: '楼梯', major: '硬装' });
    expect(filterCostEntries(entries, '客厅', '楼梯')).toHaveLength(0);
  });
  it('内置家具套用账号里的覆盖行：名称、尺寸与素材用调整后的值，并标记已调整', () => {
    const override: LibraryItem = { ...library[0], name: '我的测试床', w: library[0].w + 100 };
    const adjusted = builtinCostEntries([override]);
    expect(adjusted).toHaveLength(entries.length);
    const bed = adjusted.find(entry => entry.key === library[0].catalogId)!;
    expect(bed).toMatchObject({ name: '我的测试床', adjusted: true });
    expect(bed.furniture!.w).toBe(library[0].w + 100);
    expect(filterCostEntries(adjusted, library[0].category, ' 测试床 ')).toHaveLength(1);
    expect(entries.find(entry => entry.key === library[0].catalogId)!.adjusted).toBeUndefined();
  });
  it('硬装软装切换仅展示对应大类，搜索不跨类泄露', () => {
    expect(filterCostEntries(entries, '全部', '', '硬装')).toHaveLength(25 + stairCount);
    expect(filterCostEntries(entries, '全部', '', '软装')).toHaveLength(library.length - stairCount);
    expect(filterCostEntries(entries, '全部', '地板', '软装')).toHaveLength(0);
    expect(filterCostEntries(entries, '卧室', '床', '软装').every(entry => entry.category === '卧室')).toBe(true);
  });
  it('「自定义」只留账号里自建的条目，且限定在当前大类', () => {
    const sofa = accountItemEntry({ kind: 'furniture', item: { catalogId: 'custom-sofa', category: '客厅', type: 'sofa', name: '我的沙发', w: 2000, d: 900, color: '#ddd' } });
    const merged = [sofa, accountItemEntry({ kind: 'floor', item: floor }), ...entries];
    expect(filterCostEntries(merged, CUSTOM_CATEGORY, '', '软装').map(entry => entry.key)).toEqual(['custom-sofa']);
    expect(filterCostEntries(merged, CUSTOM_CATEGORY, '', '硬装').map(entry => entry.name)).toEqual(['混凝土浇筑']);
    // 「全部」不受自定义标记影响
    expect(filterCostEntries(merged, '全部', '', '软装')).toHaveLength(library.length - stairCount + 1);
  });
  it('地面的计价单位跟随账号采购设置，其余是固定单位', () => {
    const wood = entries.find(entry => entry.key === 'wood')!;
    expect(costUnit(wood, {})).toBe('m²');
    expect(costUnit(wood, { procurement: { wood: { unit: '箱', waste: 5 } } })).toBe('箱');
    expect(costUnit(entries.find(entry => entry.group === 'furniturePrices')!, { procurement: { wood: { unit: '箱', waste: 5 } } })).toBe('件');
  });
  it('分类数量补上全部 / 硬装 / 软装合计，自建一侧另有「自定义」', () => {
    const local = costCounts(countBy(entries, entry => entry.category), { custom: false });
    expect(local['全部']).toBe(entries.length);
    expect(local['硬装']).toBe(25 + stairCount);
    expect(local['软装']).toBe(library.length - stairCount);
    expect(local[CUSTOM_CATEGORY]).toBeUndefined();
    expect(costCounts({ 墙面: 1, 卧室: 2, 楼梯: 1 }, { custom: true })).toEqual({ 墙面: 1, 卧室: 2, 楼梯: 1, 全部: 4, 硬装: 2, 软装: 2, 自定义: 4 });
  });
  it('已显示的自建条目按种类拼成账号目录，用于计价与来源判断', () => {
    const wall = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    const item: LibraryItem = { catalogId: 'custom-sofa', category: '客厅', type: 'sofa', name: '我的沙发', w: 2000, d: 900, color: '#ddd', price: 300 };
    const catalog = accountCatalog([accountItemEntry({ kind: 'wall', item: wall }), accountItemEntry({ kind: 'furniture', item }), ...entries]);
    expect(catalog).toEqual({ customCatalog: [item], customFloors: [], customWalls: [wall], customOpenings: [], customRoofs: [], customCeilings: [] });
  });
});
describe('账号单价来源与配置不变量', () => {
  it('参考价、0与显式null分别展示，null不回退', () => {
    const d = blankDesign(), wood = entries.find(entry => entry.key === 'wood')!;
    expect(accountCostSource(d, wood)).toBe('内置参考');
    expect(accountCostSource(setPrice(d, 'floorPrices', 'wood', 0), wood)).toBe('账号默认');
    const unset = setPrice(d, 'floorPrices', 'wood', null);
    expect(accountCostSource(unset, wood)).toBe('未定价');
    expect(priceOf(unset, 'floorPrices', 'wood')).toBeNull();
    expect(accountCostSource(d, entries.find(entry => entry.key === 'paint')!)).toBe('未定价');
  });
  it('自定义家具库基础价与账号覆盖遵循同一优先级', () => {
    const item = { ...library[0], price: 150 }, d = { ...blankDesign(), customCatalog: [item] };
    const entry = entries.find(entry => entry.key === item.catalogId)!;
    expect(accountCostSource(d, entry)).toBe('账号家具库');
    expect(priceOf(d, 'furniturePrices', item.catalogId!)).toBe(150);
    const override = setPrice(d, 'furniturePrices', item.catalogId!, 0);
    expect(priceOf(override, 'furniturePrices', item.catalogId!)).toBe(0);
    expect(accountCostSource(override, entry)).toBe('账号默认');
    expect(priceOf(setPrice(d, 'furniturePrices', item.catalogId!, null), 'furniturePrices', item.catalogId!)).toBeNull();
  });
  it('调价保留隐藏施工配置及其它字段', () => {
    const d = { ...blankDesign(), costSettings: { constructionPrices: { build: 80, demolish: 20 }, wallPrices: { paint: 40 } } };
    const next = setPrice(d, 'floorPrices', 'wood', 200);
    expect(next.costSettings?.constructionPrices).toEqual(d.costSettings.constructionPrices);
    expect(next.costSettings?.wallPrices).toEqual(d.costSettings.wallPrices);
  });
  it('账号自定义地面进入地面单价列表，来源为账号地面库', () => {
    const entry = accountItemEntry({ kind: 'floor', item: floor });
    expect(entry).toMatchObject({ group: 'floorPrices', category: '地面', name: '混凝土浇筑', unit: 'm²', account: { kind: 'floor', item: floor } });
    const design = { ...referenceDesign(), ...accountCatalog([entry]) };
    expect(priceOf(design, 'floorPrices', floor.key)).toBe(90);
    expect(accountCostSource(design, entry)).toBe('账号地面库');
  });
});
