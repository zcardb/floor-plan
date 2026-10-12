import { createExportDocument } from './drawingDocument';
import { serializeDxf } from './dxfExport';
import { serializeSvg } from './svgExport';
import { encodePayload } from './designPayload';
import { alignGlyphs } from './pdfFont';
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

let fontRequest: Promise<Uint8Array> | null = null;
/**
 * PDF 用的中文字体：首次请求后缓存，失败时清掉缓存以便重试。图纸 PDF 与方案报告共用。
 * 拿到字节后先补齐字形记录（alignGlyphs），否则子集化后约一半汉字在阅读器里不显示。
 */
export function loadPdfFont() {
  fontRequest ??= fetch(PDF_FONT_URL).then(response => {
    if (!response.ok) throw new Error('中文字体加载失败，请检查网络后重试');
    return response.arrayBuffer();
  }).then(alignGlyphs).catch(error => { fontRequest = null; throw error; });
  return fontRequest;
}

async function drawingBlob(design: Design, format: DrawingFormat, name: string): Promise<Blob> {
  if (format !== 'pdf') return new Blob([serializeDrawing(design, format, name)], { type: MIME[format] });
  const drawing = createExportDocument(design);
  const [{ serializePdf }, fontBytes] = await Promise.all([import('./pdfExport'), loadPdfFont()]);
  const bytes = await serializePdf(drawing, { fontBytes, title: name });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME.pdf });
}

/** 导出文件名：去掉文件系统不允许的字符（替换为 -），空名回落「平面图」。所有导出文件共用这一条规则。 */
export const fileName = (name: string, extension: string) => `${name.replace(/[\\/:*?"<>|]/g, '-') || '平面图'}.${extension}`;
export interface ExportFile { blob: Blob; name: string }

/** 只生成文件；保存方式（直接下载 / 微信长按保存）由调用方统一决定。 */
export async function drawingFile(design: Design, format: DrawingFormat, name: string): Promise<ExportFile> {
  return { blob: await drawingBlob(design, format, name), name: fileName(name, format) };
}
export function projectJsonFile(design: Design, name: string): ExportFile {
  return { blob: new Blob([serializeProjectJson(design, name)], { type: MIME.json }), name: fileName(name, 'json') };
}
