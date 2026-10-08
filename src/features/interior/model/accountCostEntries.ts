import { categories, library } from '../data/catalog';
import { builtinFloors, customFloorMaterial, type FloorMaterial } from './floorMaterials';
import { priceOf, type PriceGroup } from './costs';
import { HARD_CATEGORIES, customWallMaterial, wallMaterials, type WallMaterial } from './hardMaterials';
import type { AccountCostSettings } from './costDefaults';
import type { CustomFloor, CustomOpening, CustomWall, Design, LibraryItem } from './types';

export type CostMajor = '硬装' | '软装';
export type CostEntry = { group: PriceGroup; key: string; name: string; category: string; unit: string; major: CostMajor; furniture?: LibraryItem; floor?: FloorMaterial; wall?: WallMaterial; opening?: CustomOpening; custom?: boolean };
export const materialCostCategories = HARD_CATEGORIES;
export const costCategories = [...materialCostCategories, ...categories];
export function accountCostEntries(items: LibraryItem[], settings: AccountCostSettings, floors: CustomFloor[] = [], walls: CustomWall[] = [], openings: CustomOpening[] = []): CostEntry[] {
  const customIds = new Set(items.map(item => item.catalogId));
  const furniture = [...items, ...library.filter(item => !customIds.has(item.catalogId))];
  const hard = { major: '硬装' as const, unit: 'm²' };
  return [
    ...[...floors.map(floor => [floor.key, customFloorMaterial(floor)] as const), ...Object.entries(builtinFloors)].map(([key, floor]) => ({ group: 'floorPrices' as const, key, name: floor.name, category: '地面', major: '硬装' as const, floor, custom: !!floor.custom, unit: settings.procurement?.[key]?.unit || 'm²' })),
    ...[...walls.map(wall => [wall.key, customWallMaterial(wall)] as const), ...Object.entries(wallMaterials)].map(([key, wall]) => ({ ...hard, group: 'wallPrices' as const, key, name: wall.name, category: '墙面', wall, custom: !!wall.custom })),
    ...openings.map(opening => ({ ...hard, group: 'openingPrices' as const, key: opening.key, name: opening.name, category: '门窗', opening, custom: true })),
    ...[{ key: 'door', name: '门' }, { key: 'window', name: '窗' }].map(item => ({ ...item, ...hard, group: 'openingPrices' as const, category: '门窗' })),
    ...furniture.map(item => ({ group: 'furniturePrices' as const, key: item.catalogId!, name: item.name, category: item.category, major: '软装' as const, furniture: item, custom: customIds.has(item.catalogId), unit: '件' })),
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
  if (entry.group === 'wallPrices' && design.customWalls?.some(wall => wall.key === entry.key)) return '账号墙面库';
  if (entry.group === 'openingPrices' && design.customOpenings?.some(opening => opening.key === entry.key)) return '账号门窗库';
  return entry.group === 'furniturePrices' ? '账号家具库' : '内置参考';
}
