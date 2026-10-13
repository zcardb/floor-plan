import type { DrawingLayer } from './drawing-document';

/** Export appearance per layer, in model millimetres. Export files carry literal colours, not UI tokens. */
export interface LayerStyle { stroke: string; strokeWidth: number; fill?: string; dash?: [number, number] }
export const LAYER_STYLES: Record<DrawingLayer, LayerStyle> = {
  WALLS: { stroke: '#514a40', strokeWidth: 8, fill: '#514a40' },
  DEMOLISHED: { stroke: '#ad5145', strokeWidth: 10, dash: [80, 50] },
  ROOMS: { stroke: '#b7afa3', strokeWidth: 6 },
  SEPARATORS: { stroke: '#5b6c7a', strokeWidth: 6, dash: [80, 50] },
  DOORS: { stroke: '#514a40', strokeWidth: 10 },
  WINDOWS: { stroke: '#514a40', strokeWidth: 10 },
  FURNITURE: { stroke: '#6f655a', strokeWidth: 6 },
  STAIRS: { stroke: '#6f655a', strokeWidth: 6 },
  ROOM_LABELS: { stroke: '#514a40', strokeWidth: 0 },
  DIMENSIONS: { stroke: '#887b69', strokeWidth: 8 },
};
/** DXF-only layer carrying the solid wall fill (HATCH), so wall outlines stay editable on their own layer. */
export const DXF_WALL_HATCH_LAYER = 'WALL_HATCH';
export type DxfLayerName = DrawingLayer | typeof DXF_WALL_HATCH_LAYER;
/** CAD layer table: AutoCAD Color Index, lineweight (1/100 mm, standard steps) and linetype name. */
export interface DxfLayerStyle { color: number; lineweight: number; lineType: 'CONTINUOUS' | 'DASHED' }
export const DXF_LAYER_STYLES: Record<DxfLayerName, DxfLayerStyle> = {
  WALLS: { color: 7, lineweight: 50, lineType: 'CONTINUOUS' },
  WALL_HATCH: { color: 8, lineweight: 0, lineType: 'CONTINUOUS' },
  DEMOLISHED: { color: 1, lineweight: 35, lineType: 'DASHED' },
  ROOMS: { color: 8, lineweight: 18, lineType: 'CONTINUOUS' },
  SEPARATORS: { color: 8, lineweight: 18, lineType: 'DASHED' },
  DOORS: { color: 4, lineweight: 25, lineType: 'CONTINUOUS' },
  WINDOWS: { color: 5, lineweight: 25, lineType: 'CONTINUOUS' },
  FURNITURE: { color: 30, lineweight: 18, lineType: 'CONTINUOUS' },
  STAIRS: { color: 6, lineweight: 18, lineType: 'CONTINUOUS' },
  ROOM_LABELS: { color: 2, lineweight: 18, lineType: 'CONTINUOUS' },
  DIMENSIONS: { color: 3, lineweight: 13, lineType: 'CONTINUOUS' },
};
/**
 * DXF 图层名采用 AIA CAD Layer Guidelines / 美国国家 CAD 标准（NCS）的建筑专业（A-）命名，
 * 在 AutoCAD、Revit、ArchiCAD 等软件里打开即可按图层识别。内部仍用语义化的键，写文件时映射。
 */
export const CAD_LAYER_NAMES: Record<DxfLayerName, string> = {
  WALLS: 'A-WALL',
  WALL_HATCH: 'A-WALL-PATT',
  DEMOLISHED: 'A-WALL-DEMO',
  ROOMS: 'A-AREA',
  SEPARATORS: 'A-AREA-BNDY',
  DOORS: 'A-DOOR',
  WINDOWS: 'A-GLAZ',
  FURNITURE: 'A-FURN',
  STAIRS: 'A-FLOR-STRS',
  ROOM_LABELS: 'A-AREA-IDEN',
  DIMENSIONS: 'A-ANNO-DIMS',
};
/** DASHED linetype pattern in model millimetres, matching the SVG/PDF demolished-wall dash. */
export const DXF_DASHED_PATTERN = [LAYER_STYLES.DEMOLISHED.dash![0], -LAYER_STYLES.DEMOLISHED.dash![1]];
export const EXPORT_FONT_STACK = "'PingFang SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC',sans-serif";
/** Offset from the visual centre of a line of text to its baseline, as a fraction of font size. */
export const TEXT_BASELINE_SHIFT = 0.35;

/**
 * 制图规范（GB/T 50001、ISO 128）：文字从图纸下方或右侧阅读。drawing（y 向下）坐标下的角度归一到 [-90°, 90°)，
 * 对应 DXF 角度不落在 (90°, 270°]。文字均为居中对齐，翻转 180° 不改变位置。
 */
export function readableRotation(degrees: number): number {
  const a = ((degrees % 360) + 360) % 360;
  return a >= 90 && a < 270 ? a - 180 : a >= 270 ? a - 360 : a;
}
