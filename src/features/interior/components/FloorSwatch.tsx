import { useId } from 'react';
import type { FloorMaterial } from '../model/floorMaterials';
import { FloorPattern } from './Materials';

/** 地面纹理预览，与平面图使用同一套铺贴图案。 */
export function FloorSwatch({ material, size = 2400 }: { material: FloorMaterial; size?: number }) {
  const id = 'floor-swatch-' + useId().replace(/:/g, '');
  return <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <defs><FloorPattern id={id} m={material} /></defs>
    <rect width={size} height={size} fill={`url(#${id})`} />
  </svg>;
}
