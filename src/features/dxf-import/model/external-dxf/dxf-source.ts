import type { Point } from '@/lib/floor-plan/types';

export type DxfUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export const DXF_UNITS: { id: DxfUnit; label: string; mm: number }[] = [
  { id: 'mm', label: '毫米 mm', mm: 1 },
  { id: 'cm', label: '厘米 cm', mm: 10 },
  { id: 'm', label: '米 m', mm: 1000 },
  { id: 'in', label: '英寸 in', mm: 25.4 },
  { id: 'ft', label: '英尺 ft', mm: 304.8 },
];
export const unitMm = (unit: DxfUnit) => DXF_UNITS.find(u => u.id === unit)!.mm;

/** 图纸里的一段直线（原始图纸单位、CAD 坐标系 Y 向上）。group 标记来自同一个块插入；arc 标记由圆弧折线化而来。 */
export interface DxfSegment { a: Point; b: Point; layer: string; group?: number; arc?: boolean }
export interface DxfSource { segments: DxfSegment[]; layers: { name: string; count: number }[]; unit: DxfUnit; unitDetected: boolean }
