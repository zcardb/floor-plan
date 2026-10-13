import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, type PDFEmbeddedPage, type PDFObject, type PDFPage } from "pdf-lib";
import type { DrawingDocument } from "./drawing-document";
import { drawingSheet } from "./drawing-scale";
import { serializePdf } from "./pdf-export";

/**
 * 把矢量平面图放进别的 PDF 页面。
 *
 * 复用 serializePdf 的单页平面图：copyPages 拷进目标文档后包成表单 XObject，就能按任意比例画到任意页面上，
 * 页面上的其它内容（标题、信息带、页脚）照常另画。图层的标记内容留在表单的内容流里、图层对象留在表单自己的资源里，
 * 再登记到目标文档的目录，阅读器里仍可逐层开关。
 */
export interface EmbeddedPlan {
  form: PDFEmbeddedPage;
  /** 原图的出图比例（1:scale），表单的尺寸就是按这个比例出的图幅。 */
  scale: number;
}

export async function embedPlan(pdf: PDFDocument, plan: DrawingDocument, options: { fontBytes: Uint8Array; title?: string }): Promise<EmbeddedPlan> {
  const source = await PDFDocument.load(await serializePdf(plan, options));
  const [copied] = await pdf.copyPages(source, [0]);
  // embed 会改写页面的 Contents，原内容流的引用要先记下来。
  const original = contentRefs(pdf, copied.node.get(PDFName.of("Contents")));
  const form = await pdf.embedPage(copied);
  await form.embed();
  keepLayers(pdf, copied);
  // 图形已整体进了表单；拷贝来的原页不在页面树里，删掉以免同一份图形在文件里存两遍。
  for (const ref of [...original, copied.ref]) pdf.context.delete(ref);
  return { form, scale: drawingSheet(plan).scale };
}

/** GB/T 50001 的常用 / 可用比例。 */
const PRINT_SCALES = [50, 60, 80, 100, 150, 200, 250, 300, 400, 500, 1000];

/**
 * 把平面图放进 width × height（pt）的范围：放得下就保持出图比例，放不下时取能放下的最大标准比例。
 * 返回打印比例（1:scale）与画到页面上的缩放系数。
 */
export function fitPlan({ form, scale }: EmbeddedPlan, width: number, height: number) {
  const fit = Math.min(width / form.width, height / form.height);
  const print = fit >= 1 ? scale : (PRINT_SCALES.find((s) => s >= scale / fit) ?? Math.ceil(scale / fit));
  return { scale: print, factor: scale / print };
}

/** 页面内容流的全部引用（Contents 可以是单个流、流数组，或指向数组的引用）。 */
function contentRefs(pdf: PDFDocument, contents: PDFObject | undefined): PDFRef[] {
  if (contents instanceof PDFArray) return contents.asArray().flatMap((item) => contentRefs(pdf, item));
  if (!(contents instanceof PDFRef)) return [];
  const target = pdf.context.lookup(contents);
  return [contents, ...(target instanceof PDFArray ? contentRefs(pdf, target) : [])];
}

/** 平面图的图层（OCG）随资源一起拷过来了；登记到文档目录，阅读器的图层面板里才列得出来、才能逐层开关。 */
function keepLayers(pdf: PDFDocument, page: PDFPage) {
  const properties = page.node.Resources()?.lookupMaybe(PDFName.of("Properties"), PDFDict);
  const ocgs = properties?.values().filter((v): v is PDFRef => v instanceof PDFRef) ?? [];
  if (ocgs.length) pdf.catalog.set(PDFName.of("OCProperties"), pdf.context.obj({ OCGs: ocgs, D: { Order: ocgs, ON: ocgs } }));
}
