import { PAYLOAD_MARKER, decodePayload } from './designPayload';
import { validateDesign } from './validation';
import type { Design } from './types';

export const IMPORT_FORMATS = [
  { id: 'json', label: '方案文件', extension: '.json' },
  { id: 'dxf', label: 'CAD 图纸', extension: '.dxf' },
  { id: 'svg', label: 'SVG 矢量图', extension: '.svg' },
] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number]['id'];
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const FOREIGN_DRAWING_ERROR = '暂不支持识别外部图纸，请导入本应用导出的文件';
export interface ImportedDesign { design: Design; name: string }
type ImportFile = Pick<File, 'name' | 'size' | 'text'>;

/** Base64 payload from SVG `<metadata>`. */
function svgPayload(text: string) {
  const match = text.match(new RegExp(`<design\\b[^>]*format="${PAYLOAD_MARKER}"[^>]*>([A-Za-z0-9+/=\\s]+)</design>`));
  return match?.[1];
}

/** Base64 payload from leading DXF `999` comments: marker line with chunk count, then the chunks. */
function dxfPayload(text: string) {
  const lines = text.split(/\r?\n/), comments: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].trim() === '999') comments.push(lines[i + 1]);
  const start = comments.findIndex(line => line.startsWith(PAYLOAD_MARKER + ' '));
  if (start < 0) return undefined;
  const count = Number(comments[start].slice(PAYLOAD_MARKER.length + 1));
  const chunks = comments.slice(start + 1, start + 1 + count);
  return Number.isInteger(count) && count > 0 && chunks.length === count ? chunks.join('') : undefined;
}

function embedded(payload: string | undefined, fallbackName: string): ImportedDesign {
  if (!payload) throw new Error(FOREIGN_DRAWING_ERROR);
  let data: { name?: unknown; design?: unknown };
  try { data = decodePayload(payload) as typeof data; } catch { throw new Error('文件中的方案数据已损坏'); }
  return { design: validateDesign(data?.design), name: typeof data?.name === 'string' && data.name.trim() ? data.name : fallbackName };
}

/** Reads a JSON / DXF / SVG file into a validated design. Only files exported by this app carry a design. */
export async function parseDesignFile(file: ImportFile): Promise<ImportedDesign> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error('文件超过 5 MB，无法导入');
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const fallbackName = file.name.replace(/\.[^.]+$/, '') || '导入的方案';
  const text = await file.text();
  if (extension === 'svg') return embedded(svgPayload(text), fallbackName);
  if (extension === 'dxf') return embedded(dxfPayload(text), fallbackName);
  if (extension !== 'json') throw new Error('只支持 JSON、DXF、SVG 文件');
  let raw: { name?: unknown; state?: unknown };
  try { raw = JSON.parse(text); } catch { throw new Error('方案文件格式不正确'); }
  if (!raw || typeof raw !== 'object') throw new Error('方案文件格式不正确');
  // Exported JSON is `{ name, ...design }`; project rows are `{ name, state }`.
  const { name, state, ...design } = raw;
  return {
    design: validateDesign(state || design),
    name: typeof name === 'string' && name.trim() ? name : fallbackName,
  };
}
