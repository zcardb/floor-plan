import fontkit from '@pdf-lib/fontkit';
import {
  LineCapStyle, LineJoinStyle, PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, closePath, degrees,
  endMarkedContent, fillAndStroke, lineTo, moveTo, popGraphicsState, pushGraphicsState, rgb, setDashPattern,
  setFillingRgbColor, setLineCap, setLineJoin, setLineWidth, setStrokingRgbColor, stroke,
} from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { DRAWING_LAYERS, DRAWING_LAYER_NAMES, type DrawingDocument, type DrawingEntity } from './drawingDocument';
import { drawingSheet } from './drawingScale';
import { LAYER_STYLES, TEXT_BASELINE_SHIFT } from './drawingStyle';
import type { Point } from './types';

const MM_TO_PT = 72 / 25.4;
const hex = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Arc as a polyline in model space, sampled at roughly 20 mm chord length. */
function arcPoints(e: Extract<DrawingEntity, { kind: 'arc' }>): Point[] {
  const turn = 2 * Math.PI, sweep = e.clockwise ? ((e.end - e.start) % turn + turn) % turn : -(((e.start - e.end) % turn + turn) % turn);
  const count = Math.max(8, Math.ceil(Math.abs(sweep) * e.radius / 20));
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = e.start + sweep * i / count;
    return [e.center[0] + e.radius * Math.cos(a), e.center[1] + e.radius * Math.sin(a)];
  });
}

/** Vector PDF at the shared drawing scale; each drawing layer is a toggleable optional-content group. */
export async function serializePdf(document: DrawingDocument, options: { fontBytes: ArrayBuffer | Uint8Array; title?: string }): Promise<Uint8Array> {
  const sheet = drawingSheet(document), k = MM_TO_PT / sheet.scale;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(options.fontBytes, { subset: true });
  const title = options.title || '平面图';
  pdf.setTitle(title); pdf.setSubject(`比例 1:${sheet.scale}`); pdf.setCreator('筑间 STUDIO'); pdf.setProducer('筑间 STUDIO');
  const page = pdf.addPage([sheet.paperWidth * MM_TO_PT, sheet.paperHeight * MM_TO_PT]);
  const pageHeight = page.getHeight();
  const at = ([x, y]: Point): Point => [(x - sheet.x) * k, pageHeight - (y - sheet.y) * k];
  const entities = [...document.entities, ...document.dimensions.flatMap(d => d.display)];
  const properties = pdf.context.obj({}), ocgs = [];
  for (const layer of DRAWING_LAYERS) {
    const items = entities.filter(e => e.layer === layer);
    if (!items.length) continue;
    const tag = `L${ocgs.length}`;
    const ocg = pdf.context.register(pdf.context.obj({ Type: 'OCG', Name: PDFHexString.fromText(DRAWING_LAYER_NAMES[layer]) }));
    ocgs.push(ocg); properties.set(PDFName.of(tag), ocg);
    const style = LAYER_STYLES[layer];
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), PDFName.of(tag)]),
      pushGraphicsState(), setStrokingRgbColor(...hex(style.stroke)), setFillingRgbColor(...hex(style.fill ?? style.stroke)),
      setLineWidth(style.strokeWidth * k), setLineJoin(LineJoinStyle.Round), setLineCap(LineCapStyle.Round),
      ...(style.dash ? [setDashPattern(style.dash.map(v => v * k), 0)] : []),
    );
    for (const e of items) {
      if (e.kind === 'text') { drawText(page, font, e, at, k, style.stroke); continue; }
      const points = (e.kind === 'arc' ? arcPoints(e) : e.points).map(at), closed = e.kind === 'polyline' && e.closed;
      page.pushOperators(moveTo(...points[0]), ...points.slice(1).map(p => lineTo(...p)),
        ...(closed ? [closePath()] : []), closed && style.fill ? fillAndStroke() : stroke());
    }
    page.pushOperators(popGraphicsState(), endMarkedContent());
  }
  page.node.Resources()!.set(PDFName.of('Properties'), properties);
  pdf.catalog.set(PDFName.of('OCProperties'), pdf.context.obj({ OCGs: ocgs, D: { Order: ocgs, ON: ocgs } }));
  return pdf.save();
}

function drawText(page: PDFPage, font: PDFFont, e: Extract<DrawingEntity, { kind: 'text' }>, at: (p: Point) => Point, k: number, color: string) {
  const size = e.height * k, width = font.widthOfTextAtSize(e.text, size);
  const angle = -e.rotation * Math.PI / 180, [cx, cy] = at(e.point);
  const ux = Math.cos(angle), uy = Math.sin(angle), shift = size * TEXT_BASELINE_SHIFT;
  page.drawText(e.text, {
    x: cx - ux * width / 2 + uy * shift, y: cy - uy * width / 2 - ux * shift,
    size, font, color: rgb(...hex(color)), rotate: degrees(-e.rotation),
  });
}
