import type { Design } from '@/lib/floor-plan/types';

/** 北方相对图纸正上方的顺时针角度（°）；旧项目没有该字段，按上北处理。 */
export function northAngle(d: Pick<Design, 'northAngle'>): number {
  return d.northAngle ?? 0;
}

export function changeNorthAngle(d: Design, degrees: number): Design {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) throw new Error('北方角度须为有效数字');
  const value = ((Math.round(degrees) % 360) + 360) % 360;
  return { ...d, northAngle: value };
}
