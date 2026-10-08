import { categories } from '../data/catalog';
import { HARD_CATEGORIES } from './hardMaterials';

/** 新建弹窗的初始分类：硬装与软装分类原样保留，其余（全部 / 自定义 / 空）默认客厅。 */
export function newFurnitureCategory(category?: string): string {
  return category && (categories.includes(category) || HARD_CATEGORIES.includes(category)) ? category : '客厅';
}
