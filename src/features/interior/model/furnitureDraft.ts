import type { LibraryItem } from './types';
import { appearanceDimensions, resolvedFurnitureType, type FurnitureOutline } from './furnitureAppearance';
import { meterDraft, parseMeterDraft } from './lengthUnits';
import { validPrice } from './costs';

/** 新建 / 编辑家具共用的表单草稿：尺寸以米为单位的文本，价格为空表示未定价。 */
export interface FurnitureDraft {
  name: string;
  category: string;
  /** 'auto' 表示按名称匹配参考类型。 */
  typeChoice: string;
  shape: FurnitureOutline;
  w: string;
  d: string;
  h: string;
  price: string;
  color: string;
}

export const emptyFurnitureDraft = (category: string): FurnitureDraft =>
  ({ name: '', category, typeChoice: 'auto', shape: 'reference', w: '1.8', d: '0.8', h: '0.8', price: '', color: '#b7c4b0' });

export const furnitureDraftOf = (item: LibraryItem): FurnitureDraft => ({
  name: item.name,
  category: item.category,
  typeChoice: item.type,
  shape: item.shape || 'reference',
  w: meterDraft(item.w),
  d: meterDraft(item.d),
  h: meterDraft(item.height || 700),
  price: item.price == null ? '' : String(item.price),
  color: item.color,
});

export type ParsedFurnitureDraft = Pick<LibraryItem, 'name' | 'category' | 'type' | 'shape' | 'w' | 'd' | 'height' | 'color'> & { price: number | null };

export const FURNITURE_DRAFT_ERROR = '请填写名称、有效尺寸及非负单价';

/** 校验并换算成毫米；无效返回 null。 */
export function parseFurnitureDraft(draft: FurnitureDraft): ParsedFurnitureDraft | null {
  const w = parseMeterDraft(draft.w), d = draft.shape === 'circle' ? w : parseMeterDraft(draft.d), height = parseMeterDraft(draft.h);
  const price = draft.price.trim() === '' ? null : Number(draft.price);
  if (!draft.name.trim() || ![w, d].every(n => Number.isFinite(n) && n >= 50 && n <= 20000)) return null;
  if (!Number.isFinite(height) || height < 50 || height > 8000 || (price !== null && !validPrice(price))) return null;
  return { name: draft.name.trim(), category: draft.category, type: resolvedFurnitureType(draft.name, draft.typeChoice), shape: draft.shape, w, d, height, color: draft.color, price };
}

/** 预览用：无效尺寸时退回占位尺寸，保证参考符号始终可画。 */
export function previewFurnitureDraft(draft: FurnitureDraft, fallback: Pick<LibraryItem, 'w' | 'd' | 'height'> = { w: 1800, d: 800, height: 800 }) {
  const height = parseMeterDraft(draft.h);
  return {
    name: draft.name,
    category: draft.category,
    type: resolvedFurnitureType(draft.name, draft.typeChoice),
    shape: draft.shape,
    color: draft.color,
    height: Number.isFinite(height) && height >= 50 ? height : fallback.height,
    ...appearanceDimensions(draft.shape, parseMeterDraft(draft.w) || fallback.w, parseMeterDraft(draft.d) || fallback.d),
  };
}
