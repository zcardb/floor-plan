import { categories } from '../data/catalog';

export function newFurnitureCategory(category?: string): string {
  return category && categories.includes(category) ? category : '客厅';
}
