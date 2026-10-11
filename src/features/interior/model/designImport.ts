import { PAYLOAD_MARKER, decodePayload } from './designPayload';
import { validateDesign } from './validation';
import type { DxfSource } from './externalDxf/dxfSource';
import type { Design } from './types';

/** 导入入口只开放 DXF；JSON / SVG 的解析保留给本应用导出文件的回读。 */
export const IMPORT_ACCEPT = '.dxf,.dwg';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const FOREIGN_SVG_ERROR = '暂不支持识别外部 SVG，请从 CAD 导出 DXF 后导入';
export const DWG_ERROR = 'DWG 是 AutoCAD 私有格式，请在 CAD 中另存为 DXF 后导入';
/** design：本应用导出的文件，直接还原；dxf：外部 CAD 图纸，需要经过识别确认。 */
export type ImportedFile =
  | { kind: 'design'; design: Design; name: string }
  | { kind: 'dxf'; source: DxfSource; name: string };
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

function embedded(payload: string, fallbackName: string): ImportedFile {
  let data: { name?: unknown; design?: unknown };
  try { data = decodePayload(payload) as typeof data; } catch { throw new Error('文件中的方案数据已损坏'); }
  return { kind: 'design', design: validateDesign(data?.design), name: typeof data?.name === 'string' && data.name.trim() ? data.name : fallbackName };
}

/**
 * Reads a JSON / DXF / SVG file. Files exported by this app carry the design itself;
 * a DXF without one is an external CAD drawing and is returned as line work for recognition.
 */
export async function parseDesignFile(file: ImportFile): Promise<ImportedFile> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error('文件超过 5 MB，无法导入');
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const fallbackName = file.name.replace(/\.[^.]+$/, '') || '导入的方案';
  if (extension === 'dwg') throw new Error(DWG_ERROR);
  if (extension !== 'svg' && extension !== 'dxf' && extension !== 'json') throw new Error('只支持 DXF 图纸');
  const text = await file.text();
  if (extension === 'svg') {
    const payload = svgPayload(text);
    if (!payload) throw new Error(FOREIGN_SVG_ERROR);
    return embedded(payload, fallbackName);
  }
  if (extension === 'dxf') {
    const payload = dxfPayload(text);
    if (payload) return embedded(payload, fallbackName);
    // 外部图纸才需要 dxf-parser：按需下载，不进首屏包。
    const { readDxfSource } = await import('./externalDxf/readDxf');
    return { kind: 'dxf', source: readDxfSource(text), name: fallbackName };
  }
  let raw: { name?: unknown; state?: unknown };
  try { raw = JSON.parse(text); } catch { throw new Error('方案文件格式不正确'); }
  if (!raw || typeof raw !== 'object') throw new Error('方案文件格式不正确');
  // Exported JSON is `{ name, ...design }`; project rows are `{ name, state }`.
  const { name, state, ...design } = raw;
  return {
    kind: 'design',
    design: validateDesign(state || design),
    name: typeof name === 'string' && name.trim() ? name : fallbackName,
  };
}
