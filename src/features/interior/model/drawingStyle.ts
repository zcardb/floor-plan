import type { DrawingLayer } from './drawingDocument';

/** Export appearance per layer, in model millimetres. Export files carry literal colours, not UI tokens. */
export interface LayerStyle { stroke: string; strokeWidth: number; fill?: string; dash?: [number, number] }
export const LAYER_STYLES: Record<DrawingLayer, LayerStyle> = {
  WALLS: { stroke: '#514a40', strokeWidth: 8, fill: '#514a40' },
  DEMOLISHED: { stroke: '#ad5145', strokeWidth: 10, dash: [80, 50] },
  ROOMS: { stroke: '#b7afa3', strokeWidth: 6 },
  OPENINGS: { stroke: '#514a40', strokeWidth: 10 },
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
  OPENINGS: { color: 4, lineweight: 25, lineType: 'CONTINUOUS' },
  FURNITURE: { color: 30, lineweight: 18, lineType: 'CONTINUOUS' },
  STAIRS: { color: 6, lineweight: 18, lineType: 'CONTINUOUS' },
  ROOM_LABELS: { color: 2, lineweight: 18, lineType: 'CONTINUOUS' },
  DIMENSIONS: { color: 3, lineweight: 13, lineType: 'CONTINUOUS' },
};
/** DASHED linetype pattern in model millimetres, matching the SVG/PDF demolished-wall dash. */
export const DXF_DASHED_PATTERN = [LAYER_STYLES.DEMOLISHED.dash![0], -LAYER_STYLES.DEMOLISHED.dash![1]];
export const EXPORT_FONT_STACK = "'PingFang SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC',sans-serif";
/** Offset from the visual centre of a line of text to its baseline, as a fraction of font size. */
export const TEXT_BASELINE_SHIFT = 0.35;
