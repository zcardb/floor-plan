import { createExportDocument } from './drawingDocument';
import { serializeDxf } from './dxfExport';
import { serializeSvg } from './svgExport';
import { encodePayload } from './designPayload';
import type { Design } from './types';

export type DrawingFormat = 'dxf' | 'svg' | 'pdf';
export const PDF_FONT_URL = '/fonts/NotoSansSC-Regular.ttf';
const MIME: Record<DrawingFormat | 'json', string> = {
  dxf: 'application/dxf;charset=utf-8', svg: 'image/svg+xml;charset=utf-8', pdf: 'application/pdf', json: 'application/json',
};

/** Exported JSON keeps the historical `{ name, ...design }` shape. */
export const serializeProjectJson = (design: Design, name: string) => JSON.stringify({ name, ...design }, null, 2);

/** SVG / DXF always contain every layer and embed the full design for round-trip import. */
export function serializeDrawing(design: Design, format: 'dxf' | 'svg', name = '平面图'): string {
  const drawing = createExportDocument(design), payload = encodePayload({ name, design });
  return format === 'dxf' ? serializeDxf(drawing, payload) : serializeSvg(drawing, { title: name, payload });
}

let fontRequest: Promise<ArrayBuffer> | null = null;
function loadPdfFont() {
  fontRequest ??= fetch(PDF_FONT_URL).then(response => {
    if (!response.ok) throw new Error('中文字体加载失败，请检查网络后重试');
    return response.arrayBuffer();
  }).catch(error => { fontRequest = null; throw error; });
  return fontRequest;
}

async function drawingBlob(design: Design, format: DrawingFormat, name: string): Promise<Blob> {
  if (format !== 'pdf') return new Blob([serializeDrawing(design, format, name)], { type: MIME[format] });
  const drawing = createExportDocument(design);
  const [{ serializePdf }, fontBytes] = await Promise.all([import('./pdfExport'), loadPdfFont()]);
  const bytes = await serializePdf(drawing, { fontBytes, title: name });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME.pdf });
}

const fileName = (name: string, extension: string) => `${name.replace(/[\\/:*?"<>|]/g, '-') || '平面图'}.${extension}`;
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try { const link = document.createElement('a'); link.href = url; link.download = name; link.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function downloadDrawing(design: Design, format: DrawingFormat, name: string) {
  downloadBlob(await drawingBlob(design, format, name), fileName(name, format));
}
export function downloadProjectJson(design: Design, name: string) {
  downloadBlob(new Blob([serializeProjectJson(design, name)], { type: MIME.json }), fileName(name, 'json'));
}
