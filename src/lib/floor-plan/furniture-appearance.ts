import { library } from './catalog';
import type { LibraryItem } from './types';
export type FurnitureOutline = 'reference' | 'rectangle' | 'circle';
export const furnitureTypes = [...new Map(library.map(item => [item.type, { value: item.type, label: item.name }])).values(), { value: 'fireplace', label: '取暖炉 / 壁炉' }, { value: 'generic', label: '通用物件' }];
export const validFurnitureType = (type: string) => furnitureTypes.some(option => option.value === type);
export const validFurnitureOutline = (shape: unknown) => shape === undefined || shape === null || ['reference', 'rectangle', 'circle'].includes(String(shape));
const aliases: [RegExp, string][] = [
  [/火炉|壁炉|取暖炉|fireplace|wood.?stove/i, 'fireplace'],
  [/圆桌|圆形.*桌|round.?table/i, 'roundtable'],
  [/转角.*沙发|cornersofa/i, 'cornersofa'],
  [/沙发|sofa/i, 'sofa'], [/床头柜/, 'nightstand'], [/婴儿床/, 'crib'], [/床|bed/i, 'bed'],
  [/办公椅/, 'officechair'], [/椅|chair/i, 'chair'], [/书架|bookshelf/i, 'bookshelf'],
  [/书桌|办公桌|desk/i, 'desk'], [/茶几/, 'coffeetable'], [/餐桌|table/i, 'table'],
  [/燃气灶|灶台/, 'stove'], [/冰箱|fridge/i, 'fridge'], [/洗衣机/, 'washer'],
  [/地毯|rug/i, 'rug'], [/落地灯/, 'floorlamp'], [/绿植|盆栽/, 'plant'], [/柜/, 'cabinet'],
];
export function matchFurnitureType(name: string) {
  const keyword = name.trim();
  if (!keyword) return 'generic';
  return aliases.find(([pattern]) => pattern.test(keyword))?.[1] || library.find(item => item.name === keyword)?.type || 'generic';
}
export function resolvedFurnitureType(name: string, selection: string) {
  return selection === 'auto' ? matchFurnitureType(name) : selection;
}
export function appearanceDimensions(shape: FurnitureOutline, width: number, depth: number) {
  return { w: width, d: shape === 'circle' ? width : depth };
}
export function needsParameterOnly(item: Pick<LibraryItem, 'type' | 'shape'>) {
  return ['fireplace', 'generic'].includes(item.type) || (!!item.shape && item.shape !== 'reference');
}
export function filterFurnitureLibrary(items: LibraryItem[], customIds: Set<string | undefined>, category: string, query: string) {
  const keyword = query.trim().toLocaleLowerCase();
  return items.filter(item => (category === '全部' || (category === '自定义' ? customIds.has(item.catalogId) : item.category === category)) && item.name.toLocaleLowerCase().includes(keyword));
}
