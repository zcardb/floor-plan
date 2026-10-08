import type { DrawingDocument } from './drawingDocument';

/** Paper margin around the drawing, in model millimetres. */
export const DRAWING_MARGIN = 200;
/** Long side of an A0 sheet in millimetres. */
export const A0_LONG_SIDE = 1189;
const SCALES = [50, 100] as const;

/** Picks 1:50, falling back to 1:100 then 1:200 when the sheet would exceed A0. */
export function drawingScale(widthMm: number, heightMm: number): number {
  const longest = Math.max(widthMm, heightMm);
  return SCALES.find(scale => longest / scale <= A0_LONG_SIDE) ?? 200;
}

/** Model-space frame (mm) plus its scale and paper size (mm) shared by SVG and PDF. */
export function drawingSheet(document: DrawingDocument) {
  const b = document.bounds;
  const x = b.x - DRAWING_MARGIN, y = b.y - DRAWING_MARGIN;
  const width = b.x2 - b.x + DRAWING_MARGIN * 2, height = b.y2 - b.y + DRAWING_MARGIN * 2;
  const scale = drawingScale(width, height);
  return { x, y, width, height, scale, paperWidth: width / scale, paperHeight: height / scale };
}
