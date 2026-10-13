import { categories, library } from '../data/catalog';
import type { PageCounts } from '@/lib/paging';
import { assetsAdjusted, withBuiltinAssets } from './builtinAssets';
import { builtinFloors, customFloorMaterial, type FloorMaterial } from './floorMaterials';
import { priceOf, type PriceGroup } from './costs';
import { HARD_CATEGORIES, ceilingMaterials, customWallMaterial, openingKinds, roofMaterials, wallMaterials, type WallMaterial } from './hardMaterials';
import type { AccountCostSettings } from './costDefaults';
import { STAIR_CATEGORY, isStairs } from './stairs';
import type { CustomFloor, CustomOpening, CustomWall, Design, LibraryItem } from './types';

export type CostMajor = '硬装' | '软装';
/** 账号库里自建的一条（家具、地面、墙面、门窗、屋面、吊顶），保存的就是写进数据库的那份数据。 */
export type AccountItem =
  | { kind: 'furniture'; item: LibraryItem }
  | { kind: 'floor'; item: CustomFloor }
  | { kind: 'wall' | 'roof' | 'ceiling'; item: CustomWall }
  | { kind: 'opening'; item: CustomOpening };
export type CostEntry = {
  group: PriceGroup; key: string; name: string; category: string; major: CostMajor;
  /** 计价单位；地面按账号的采购设置换算（张 / 箱），显示时用 `costUnit`。 */
  unit: string;
  furniture?: LibraryItem; floor?: FloorMaterial; wall?: WallMaterial; opening?: CustomOpening;
  /** 账号里自建的条目：原始数据（内置条目没有）。 */
  account?: AccountItem;
  /** 内置家具在账号里调整过名称、尺寸、颜色或素材。 */
  adjusted?: boolean;
};
/** 账号家具库与成本的硬装分类：五类材料 + 楼梯（楼梯按件计价，没有「新建材料」表单）。 */
export const materialCostCategories = [...HARD_CATEGORIES, STAIR_CATEGORY];
export const costCategories = [...materialCostCategories, ...categories];
/** 分类筛选的特殊项：「全部」不筛分类，「自定义」只留账号里自建的条目。 */
export const COST_ALL = '全部';
export const CUSTOM_CATEGORY = '自定义';

const hard = { major: '硬装' as const, unit: 'm²' };
const furnitureEntry = (item: LibraryItem): CostEntry => ({
  group: 'furniturePrices', key: item.catalogId!, name: item.name, furniture: item, unit: '件',
  ...(isStairs(item) ? { category: STAIR_CATEGORY, major: '硬装' as const } : { category: item.category, major: '软装' as const }),
});
const surfaceGroup = { wall: ['wallPrices', '墙面'], roof: ['roofPrices', '屋面'], ceiling: ['ceilingPrices', '吊顶'] } as const;

/** 账号里自建的一条 → 管理页卡片。 */
export function accountItemEntry(account: AccountItem): CostEntry {
  switch (account.kind) {
    case 'furniture': return { ...furnitureEntry(account.item), account };
    case 'floor': return { ...hard, group: 'floorPrices', key: account.item.key, name: account.item.name, category: '地面', floor: customFloorMaterial(account.item), account };
    case 'opening': return { ...hard, group: 'openingPrices', key: account.item.key, name: account.item.name, category: '门窗', opening: account.item, account };
    default: {
      const [group, category] = surfaceGroup[account.kind];
      return { ...hard, group, key: account.item.key, name: account.item.name, category, wall: customWallMaterial(account.item), account };
    }
  }
}

/**
 * 内置条目（地面、墙面、门窗、屋面、吊顶的参考材料与全部内置家具），按管理页的分类顺序排好。
 * 内置家具套用账号里的覆盖行（同 catalogId）：名称、尺寸、颜色与素材用调整后的值。
 */
export function builtinCostEntries(overrides: readonly LibraryItem[] = []): CostEntry[] {
  const byId = new Map(overrides.map(item => [item.catalogId, item]));
  const surface = (group: 'wallPrices' | 'roofPrices' | 'ceilingPrices', category: string, materials: Record<string, WallMaterial>) =>
    Object.entries(materials).map(([key, wall]): CostEntry => ({ ...hard, group, key, name: wall.name, category, wall }));
  const furniture = library.map((builtin): CostEntry => {
    const override = byId.get(builtin.catalogId);
    const item = withBuiltinAssets(builtin, override);
    return { ...furnitureEntry(item), ...(assetsAdjusted(builtin, override) ? { adjusted: true } : {}) };
  });
  const entries = [
    ...Object.entries(builtinFloors).map(([key, floor]): CostEntry => ({ ...hard, group: 'floorPrices', key, name: floor.name, category: '地面', floor })),
    ...surface('wallPrices', '墙面', wallMaterials),
    ...openingKinds.map(({ value, label }): CostEntry => ({ ...hard, key: value, name: label, group: 'openingPrices', category: '门窗' })),
    ...surface('roofPrices', '屋面', roofMaterials),
    ...surface('ceilingPrices', '吊顶', ceilingMaterials),
    ...furniture,
  ];
  return [...costCategories.flatMap(name => entries.filter(entry => entry.category === name)), ...entries.filter(entry => !costCategories.includes(entry.category))];
}

/** 计价单位：地面跟随账号的采购设置（按张 / 按箱），其余是固定单位。 */
export const costUnit = (entry: Pick<CostEntry, 'group' | 'key' | 'unit'>, settings: AccountCostSettings) =>
  entry.group === 'floorPrices' ? settings.procurement?.[entry.key]?.unit || 'm²' : entry.unit;

/**
 * 筛选胶囊的数量：各分类条数之外，再算出「全部」「硬装」「软装」（自建条目另有「自定义」）。
 * 数据库按分类统计自建条目，本地按分类统计内置条目，两份各自补齐后相加就是页面上的数量。
 */
export function costCounts(byCategory: PageCounts, { custom }: { custom: boolean }): PageCounts {
  let all = 0, hardCount = 0;
  for (const [category, count = 0] of Object.entries(byCategory)) {
    all += count;
    if (materialCostCategories.includes(category)) hardCount += count;
  }
  return { ...byCategory, [COST_ALL]: all, 硬装: hardCount, 软装: all - hardCount, ...(custom ? { [CUSTOM_CATEGORY]: all } : {}) };
}

/** 本地条目的分类数量（按 category 计数）。 */
export function countByCategory(entries: readonly Pick<CostEntry, 'category'>[]): PageCounts {
  const counts: Record<string, number> = {};
  for (const entry of entries) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  return counts;
}

/** 按大类、分类与名称筛选；「全部」不筛分类，「自定义」只留自建条目。 */
export function filterCostEntries(entries: readonly CostEntry[], category: string, query: string, major?: CostMajor) {
  const keyword = query.trim().toLocaleLowerCase();
  const inCategory = (entry: CostEntry) => category === COST_ALL || (category === CUSTOM_CATEGORY ? !!entry.account : entry.category === category);
  return entries.filter(entry => (!major || entry.major === major) && inCategory(entry) && entry.name.toLocaleLowerCase().includes(keyword));
}

/** 自建条目的原始数据按种类归位，拼成计价与「来源」判断用的账号目录。 */
export function accountCatalog(entries: readonly CostEntry[]): Pick<Design, 'customCatalog' | 'customFloors' | 'customWalls' | 'customOpenings' | 'customRoofs' | 'customCeilings'> {
  const of = <K extends AccountItem['kind']>(kind: K) =>
    entries.flatMap(entry => entry.account?.kind === kind ? [entry.account.item as Extract<AccountItem, { kind: K }>['item']] : []);
  return { customCatalog: of('furniture'), customFloors: of('floor'), customWalls: of('wall'), customOpenings: of('opening'), customRoofs: of('roof'), customCeilings: of('ceiling') };
}

export function accountCostSource(design: Design, entry: Pick<CostEntry, 'group' | 'key'>) {
  if (priceOf(design, entry.group, entry.key) === null) return '未定价';
  if (design.costSettings?.[entry.group]?.[entry.key] !== undefined) return '账号默认';
  if (entry.group === 'floorPrices' && design.customFloors?.some(floor => floor.key === entry.key)) return '账号地面库';
  if (entry.group === 'wallPrices' && design.customWalls?.some(wall => wall.key === entry.key)) return '账号墙面库';
  if (entry.group === 'openingPrices' && design.customOpenings?.some(opening => opening.key === entry.key)) return '账号门窗库';
  if (entry.group === 'roofPrices' && design.customRoofs?.some(item => item.key === entry.key)) return '账号屋面库';
  if (entry.group === 'ceilingPrices' && design.customCeilings?.some(item => item.key === entry.key)) return '账号吊顶库';
  return entry.group === 'furniturePrices' ? '账号家具库' : '内置参考';
}
