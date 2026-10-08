import { describe, expect, it } from 'vitest';
import { categories, library } from '../data/catalog';
import { blankDesign, referenceDesign } from '../data/templates';
import { accountCostEntries, accountCostSource, costCategories, filterCostEntries } from './accountCostEntries';
import { setPrice, priceOf } from './costs';

const entries = accountCostEntries([], {});
describe('账号成本分类与清单', () => {
  it('仅保留三类材料并复用家具分类，不含施工', () => {
    expect(costCategories).toEqual(['地面', '墙面', '门窗', ...categories]);
    expect(entries.some(entry => entry.group === 'constructionPrices')).toBe(false);
    expect(entries).toHaveLength(13 + library.length);
    expect(entries.find(entry => entry.key === library[0].catalogId)?.category).toBe(library[0].category);
  });
  it('按catalogId合并去重，名称与分类共同筛选', () => {
    const merged = accountCostEntries([{ ...library[0], name: '我的测试床' }], {});
    expect(merged).toHaveLength(entries.length);
    expect(filterCostEntries(merged, '卧室', ' 测试床 ')).toHaveLength(1);
    expect(filterCostEntries(merged, '地面', '测试床')).toHaveLength(0);
    expect(filterCostEntries(merged, '全部', '')).toHaveLength(entries.length);
  });
  it('硬装软装切换仅展示对应大类，搜索不跨类泄露', () => {
    expect(filterCostEntries(entries, '全部', '', '硬装')).toHaveLength(13);
    expect(filterCostEntries(entries, '全部', '', '软装')).toHaveLength(library.length);
    expect(filterCostEntries(entries, '全部', '地板', '软装')).toHaveLength(0);
    expect(filterCostEntries(entries, '卧室', '床', '软装').every(entry => entry.category === '卧室')).toBe(true);
  });
  it('采购计价单位保留', () => {
    expect(accountCostEntries([], { procurement: { wood: { unit: '箱', waste: 5 } } }).find(entry => entry.key === 'wood')?.unit).toBe('箱');
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
    const floor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '混凝土浇筑', pattern: 'seamless' as const, color: '#b8b8b0', price: 90 };
    const entry = accountCostEntries([], {}, [floor]).find(item => item.key === floor.key)!;
    expect(entry).toMatchObject({ group: 'floorPrices', category: '地面', name: '混凝土浇筑', unit: 'm²' });
    const design = { ...referenceDesign(), customFloors: [floor] };
    expect(priceOf(design, 'floorPrices', floor.key)).toBe(90);
    expect(accountCostSource(design, entry)).toBe('账号地面库');
  });
});
