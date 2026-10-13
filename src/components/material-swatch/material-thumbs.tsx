import { Ban, Circle, Square } from 'lucide-react';
import type { FloorMaterial } from '@/lib/floor-plan/floor-materials';
import type { FurnitureOutline } from '@/lib/floor-plan/furniture-appearance';
import type { LibraryItem, OpeningKind } from '@/lib/floor-plan/types';
import { FloorSwatch } from './floor-swatch';
import { FurnitureShape } from '@/components/furniture-shape/furniture-shape';
import { openingIcon } from './opening-icon';

/**
 * 带图下拉里每一项左侧的缩略图：硬装材料与平面图用同一套画法（地面纹理、材料色块、门窗符号），
 * 软装用家具的 2D 参考符号或俯视图。尺寸由外层 `.furniture-picker-visual` 统一控制。
 */
export const floorThumb = (material: FloorMaterial) => <FloorSwatch material={material} size={1200} className="material-thumb" />;

export const colorThumb = (color: string) => <span className="material-thumb" style={{ background: color }} aria-hidden="true" />;

/** 「无屋面」「原顶」等空选项。 */
export const noneThumb = () => <span className="material-thumb material-thumb-empty" aria-hidden="true"><Ban size={12} /></span>;

export function openingThumb(kind: OpeningKind) {
  const Icon = openingIcon(kind);
  return <span className="material-thumb material-thumb-icon" aria-hidden="true"><Icon size={14} /></span>;
}

/** 家具 2D：有俯视图用图，没有时画参考符号。 */
export const furnitureThumb = (item: Pick<LibraryItem, 'w' | 'd' | 'type' | 'shape' | 'color' | 'name' | 'imageUrl' | 'stair'>) => item.imageUrl
  ? <img src={item.imageUrl} crossOrigin="anonymous" alt="" />
  : <svg viewBox={`${-item.w / 2 - 80} ${-item.d / 2 - 80} ${item.w + 160} ${item.d + 160}`} aria-hidden="true"><FurnitureShape f={item} /></svg>;

/** 家具外形选项：参考原形用当前参考符号，方形 / 圆形用几何图标。 */
export function outlineThumb(outline: FurnitureOutline, reference: Parameters<typeof furnitureThumb>[0]) {
  if (outline === 'reference') return furnitureThumb({ ...reference, imageUrl: undefined, shape: 'reference' });
  const Icon = outline === 'circle' ? Circle : Square;
  return <span className="material-thumb material-thumb-icon" aria-hidden="true"><Icon size={14} /></span>;
}
