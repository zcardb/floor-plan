import { DRAWING_LAYERS, DRAWING_LAYER_NAMES, type DrawingDocument, type DrawingEntity } from './drawing-document';
import { drawingSheet } from './drawing-scale';
import { EXPORT_FONT_STACK, LAYER_STYLES, TEXT_BASELINE_SHIFT } from './drawing-style';
import { PAYLOAD_MARKER } from '@/lib/floor-plan/design-payload';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const number = (n: number) => Number(n.toFixed(5));
const INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';
/** 单个虚线对象（垭口过梁线）的虚线节奏，与拆除墙、分隔线一致。 */
const DASH = LAYER_STYLES.SEPARATORS.dash!;
export const SVG_PAYLOAD_NS = 'https://zhujian.studio/ns/design';

function element(e: DrawingEntity): string {
  if (e.kind === 'polyline')
    return `<${e.closed ? 'polygon' : 'polyline'} points="${e.points.map(([x, y]) => `${number(x)},${number(y)}`).join(' ')}"${e.dashed ? ` stroke-dasharray="${DASH.join(' ')}"` : ''}/>`;
  if (e.kind === 'text') {
    const [x, y] = e.point, style = LAYER_STYLES[e.layer];
    return `<text x="${number(x)}" y="${number(y + e.height * TEXT_BASELINE_SHIFT)}" font-size="${e.height}" fill="${style.stroke}" stroke="none" text-anchor="middle"${e.rotation ? ` transform="rotate(${number(e.rotation)} ${number(x)} ${number(y)})"` : ''}>${escape(e.text)}</text>`;
  }
  if (e.kind === 'circle') return `<circle cx="${number(e.center[0])}" cy="${number(e.center[1])}" r="${number(e.radius)}"/>`;
  if (e.kind === 'ellipse') {
    const [cx, cy] = e.center, rx = Math.hypot(...e.major), angle = Math.atan2(e.major[1], e.major[0]) * 180 / Math.PI;
    return `<ellipse cx="${number(cx)}" cy="${number(cy)}" rx="${number(rx)}" ry="${number(rx * e.ratio)}"${angle ? ` transform="rotate(${number(angle)} ${number(cx)} ${number(cy)})"` : ''}/>`;
  }
  const a = [e.center[0] + e.radius * Math.cos(e.start), e.center[1] + e.radius * Math.sin(e.start)];
  const b = [e.center[0] + e.radius * Math.cos(e.end), e.center[1] + e.radius * Math.sin(e.end)];
  const angle = ((e.clockwise ? e.end - e.start : e.start - e.end) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return `<path d="M${a.map(number).join(' ')}A${number(e.radius)} ${number(e.radius)} 0 ${angle > Math.PI ? 1 : 0} ${e.clockwise ? 1 : 0} ${b.map(number).join(' ')}"/>`;
}

/** XML-safe, unique id that Illustrator / Figma show as the layer or group name. */
function idFactory() {
  const used = new Set<string>();
  return (name: string) => {
    let base = name.trim().replace(/[^\p{L}\p{N}_.-]/gu, '_') || 'item';
    if (!/^[\p{L}_]/u.test(base)) base = '_' + base;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
}

/** Self-contained SVG: presentation attributes only, Inkscape layers, one sub-group per object, scaled paper size. */
export function serializeSvg(document: DrawingDocument, options: { title?: string; payload?: string } = {}): string {
  const sheet = drawingSheet(document), id = idFactory();
  const entities = [...document.entities, ...document.dimensions.flatMap(d => d.display)];
  const layers = DRAWING_LAYERS.map(layer => {
    const items = entities.filter(e => e.layer === layer);
    if (!items.length) return '';
    const groups = new Map<string, { name: string; parts: string[] }>(), order: string[] = [];
    for (const e of items) {
      if (!e.group) { order.push(element(e)); continue; }
      let group = groups.get(e.group.id);
      if (!group) { group = { name: e.group.name, parts: [] }; groups.set(e.group.id, group); order.push(`\u0000${e.group.id}`); }
      group.parts.push(element(e));
    }
    const body = order.map(item => {
      if (!item.startsWith('\u0000')) return item;
      const group = groups.get(item.slice(1))!;
      return `<g id="${escape(id(group.name))}" inkscape:label="${escape(group.name)}"><title>${escape(group.name)}</title>${group.parts.join('')}</g>`;
    }).join('');
    const style = LAYER_STYLES[layer], name = DRAWING_LAYER_NAMES[layer];
    const attrs = [`fill="${style.fill ?? 'none'}"`, `stroke="${style.stroke}"`, `stroke-width="${style.strokeWidth}"`, 'stroke-linejoin="round"', 'stroke-linecap="round"',
      ...(style.dash ? [`stroke-dasharray="${style.dash.join(' ')}"`] : [])].join(' ');
    return `<g id="${escape(id(name))}" inkscape:groupmode="layer" inkscape:label="${name}" ${attrs}>${body}</g>`;
  }).join('');
  const title = escape(options.title || '平面图');
  const metadata = options.payload
    ? `<metadata><design xmlns="${SVG_PAYLOAD_NS}" format="${PAYLOAD_MARKER}" encoding="base64">${options.payload}</design></metadata>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="${INKSCAPE}" version="1.1" width="${number(sheet.paperWidth)}mm" height="${number(sheet.paperHeight)}mm" viewBox="${[sheet.x, sheet.y, sheet.width, sheet.height].map(number).join(' ')}" font-family="${EXPORT_FONT_STACK}"><title>${title}</title><desc>比例 1:${sheet.scale}；模型单位：毫米；尺寸文字：米。</desc>${metadata}${layers}</svg>`;
}
