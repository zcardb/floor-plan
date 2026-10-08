import { categories, library } from '../data/catalog';
import { builtinFloors, customFloorMaterial, type FloorMaterial } from './floorMaterials';
import { priceOf, wallMaterials, type PriceGroup } from './costs';
import type { AccountCostSettings } from './costDefaults';
import type { CustomFloor, Design, LibraryItem } from './types';

export type CostMajor = '硬装' | '软装';
export type CostEntry = { group: PriceGroup; key: string; name: string; category: string; unit: string; major: CostMajor; furniture?: LibraryItem; floor?: FloorMaterial };
export const materialCostCategories = ['地面', '墙面', '门窗'];
export const costCategories = [...materialCostCategories, ...categories];
export function accountCostEntries(items: LibraryItem[], settings: AccountCostSettings, floors: CustomFloor[] = []): CostEntry[] {
  const customIds = new Set(items.map(item => item.catalogId));
  const furniture = [...items, ...library.filter(item => !customIds.has(item.catalogId))];
  return [
    ...[...floors.map(floor => [floor.key, customFloorMaterial(floor)] as const), ...Object.entries(builtinFloors)].map(([key, floor]) => ({ group: 'floorPrices' as const, key, name: floor.name, category: '地面', major: '硬装' as const, floor, unit: settings.procurement?.[key]?.unit || 'm²' })),
    ...Object.entries(wallMaterials).map(([key, item]) => ({ group: 'wallPrices' as const, key, name: item.name, category: '墙面', major: '硬装' as const, unit: 'm²' })),
    ...[{ key: 'door', name: '门' }, { key: 'window', name: '窗' }].map(item => ({ ...item, group: 'openingPrices' as const, category: '门窗', major: '硬装' as const, unit: 'm²' })),
    ...furniture.map(item => ({ group: 'furniturePrices' as const, key: item.catalogId!, name: item.name, category: item.category, major: '软装' as const, furniture: item, unit: '件' })),
  ];
}
export function filterCostEntries(entries: CostEntry[], category: string, query: string, major?: CostMajor) {
  const keyword = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!major || entry.major === major) && (category === '全部' || entry.category === category) && entry.name.toLocaleLowerCase().includes(keyword));
}
export function accountCostSource(design: Design, entry: Pick<CostEntry, 'group' | 'key'>) {
  if (priceOf(design, entry.group, entry.key) === null) return '未定价';
  if (design.costSettings?.[entry.group]?.[entry.key] !== undefined) return '账号默认';
  if (entry.group === 'floorPrices' && design.customFloors?.some(floor => floor.key === entry.key)) return '账号地面库';
  return entry.group === 'furniturePrices' ? '账号家具库' : '内置参考';
}
