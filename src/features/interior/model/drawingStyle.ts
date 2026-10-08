import type { DrawingLayer } from './drawingDocument';

/** Export appearance per layer, in model millimetres. Export files carry literal colours, not UI tokens. */
export interface LayerStyle { stroke: string; strokeWidth: number; fill?: string; dash?: [number, number] }
export const LAYER_STYLES: Record<DrawingLayer, LayerStyle> = {
  WALLS: { stroke: '#514a40', strokeWidth: 8, fill: '#514a40' },
  DEMOLISHED: { stroke: '#ad5145', strokeWidth: 10, dash: [80, 50] },
  ROOMS: { stroke: '#b7afa3', strokeWidth: 6 },
  OPENINGS: { stroke: '#514a40', strokeWidth: 10 },
  FURNITURE: { stroke: '#6f655a', strokeWidth: 6 },
  ROOM_LABELS: { stroke: '#514a40', strokeWidth: 0 },
  DIMENSIONS: { stroke: '#887b69', strokeWidth: 8 },
  MEASURES: { stroke: '#887b69', strokeWidth: 8 },
};
export const EXPORT_FONT_STACK = "'PingFang SC','Microsoft YaHei','Noto Sans SC','Source Han Sans SC',sans-serif";
/** Offset from the visual centre of a line of text to its baseline, as a fraction of font size. */
export const TEXT_BASELINE_SHIFT = 0.35;
