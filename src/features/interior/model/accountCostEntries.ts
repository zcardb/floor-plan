import { categories, library, materials } from '../data/catalog';
import { priceOf, wallMaterials, type PriceGroup } from './costs';
import type { AccountCostSettings } from './costDefaults';
import type { Design, LibraryItem } from './types';

export type CostEntry = { group: PriceGroup; key: string; name: string; category: string; unit: string };
export const materialCostCategories = ['地面', '墙面', '门窗'];
export const costCategories = [...materialCostCategories, ...categories];
export function accountCostEntries(items: LibraryItem[], settings: AccountCostSettings): CostEntry[] {
  const customIds = new Set(items.map(item => item.catalogId));
  const furniture = [...items, ...library.filter(item => !customIds.has(item.catalogId))];
  return [
    ...Object.entries(materials).map(([key, item]) => ({ group: 'floorPrices' as const, key, name: item.name, category: '地面', unit: settings.procurement?.[key]?.unit || 'm²' })),
    ...Object.entries(wallMaterials).map(([key, item]) => ({ group: 'wallPrices' as const, key, name: item.name, category: '墙面', unit: 'm²' })),
    ...[{ key: 'door', name: '门' }, { key: 'window', name: '窗' }].map(item => ({ ...item, group: 'openingPrices' as const, category: '门窗', unit: 'm²' })),
    ...furniture.map(item => ({ group: 'furniturePrices' as const, key: item.catalogId!, name: item.name, category: item.category, unit: '件' })),
  ];
}
export function filterCostEntries(entries: CostEntry[], category: string, query: string) {
  const keyword = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (category === '全部' || entry.category === category) && entry.name.toLocaleLowerCase().includes(keyword));
}
export function accountCostSource(design: Design, entry: Pick<CostEntry, 'group' | 'key'>) {
  if (priceOf(design, entry.group, entry.key) === null) return '未定价';
  if (design.costSettings?.[entry.group]?.[entry.key] !== undefined) return '账号默认';
  return entry.group === 'furniturePrices' ? '账号家具库' : '内置参考';
}
