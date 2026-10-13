import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { afterAll, describe, expect, it, vi } from "vitest";
import { referenceDesign } from "@/lib/floor-plan/templates";
import { drawingFile } from "../drawing-export";
import { alignGlyphs } from "../pdf-font";

const FONT_FILE = resolve(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf");
const raw = existsSync(FONT_FILE) ? new Uint8Array(readFileSync(FONT_FILE)) : null;
vi.stubGlobal("fetch", async () => (raw ? new Response(raw) : new Response(null, { status: 404 })));
afterAll(() => vi.unstubAllGlobals());
const SAMPLE = "方案报告原木之家客厅主卧室卫浴¥44,879.0123456789 m²×·—（）：";

/** 读 head.indexToLocFormat 与 loca 偏移（字节）。 */
function locaOf(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const table = (tag: string) => {
    for (let i = 0; i < view.getUint16(4); i++) {
      const at = 12 + i * 16;
      if (String.fromCharCode(...bytes.subarray(at, at + 4)) === tag) return view.getUint32(at + 8);
    }
    throw new Error(tag);
  };
  const long = view.getInt16(table("head") + 50) === 1, glyphs = view.getUint16(table("maxp") + 4), loca = table("loca");
  return { long, offsets: Array.from({ length: glyphs + 1 }, (_, i) => (long ? view.getUint32(loca + i * 4) : view.getUint16(loca + i * 2) * 2)) };
}

/** PDF 里每个子集字体的每个字形，轮廓都与原字体里同一个字完全一致（错位的字形会解析成乱码或报错）。 */
async function expectIntactGlyphs(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes), original = fontkit.create(raw!);
  let checked = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Subtype")) !== PDFName.of("Type0")) continue;
    const cidFont = pdf.context.lookup(object.lookup(PDFName.of("DescendantFonts"), PDFArray).get(0), PDFDict);
    const file = cidFont.lookup(PDFName.of("FontDescriptor"), PDFDict).lookup(PDFName.of("FontFile2")) as PDFRawStream;
    const subset = fontkit.create(decodePDFRawStream(file).decode());
    const cmap = new TextDecoder().decode(decodePDFRawStream(object.lookup(PDFName.of("ToUnicode")) as PDFRawStream).decode());
    for (const [, glyph, unicode] of cmap.slice(cmap.indexOf("beginbfchar")).matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]{4})>/gi)) {
      expect(subset.getGlyph(parseInt(glyph, 16)).path.toSVG()).toBe(original.glyphForCodePoint(parseInt(unicode, 16)).path.toSVG());
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(10);
}

describe.skipIf(!raw)("PDF 字体补齐（需要 public/fonts/NotoSansSC-Regular.ttf，字体缺失时跳过）", () => {
  it("奇数长度的字形补齐到偶数、loca 改为长格式，字形轮廓不变；已对齐的原样返回", () => {
    const before = locaOf(raw!);
    expect(before.offsets.some((o) => o % 2)).toBe(true);
    const aligned = alignGlyphs(raw!), after = locaOf(aligned);
    expect(after.long).toBe(true);
    expect(after.offsets).toHaveLength(before.offsets.length);
    expect(after.offsets.every((o) => o % 2 === 0)).toBe(true);
    const a = fontkit.create(raw!), b = fontkit.create(aligned);
    expect(b.numGlyphs).toBe(a.numGlyphs);
    for (const ch of SAMPLE) expect(b.glyphForCodePoint(ch.codePointAt(0)!).path.toSVG()).toBe(a.glyphForCodePoint(ch.codePointAt(0)!).path.toSVG());
    expect(alignGlyphs(aligned)).toBe(aligned);
  });

  it("子集嵌入后每个字形都完整", async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(alignGlyphs(raw!), { subset: true });
    pdf.addPage().drawText(SAMPLE, { x: 20, y: 400, size: 12, font });
    await expectIntactGlyphs(await pdf.save());
  });

  it("图纸 PDF 导出走 loadPdfFont，同样拿到补齐后的字体", async () => {
    const file = await drawingFile(referenceDesign(), "pdf", "我的家");
    await expectIntactGlyphs(new Uint8Array(await file.blob.arrayBuffer()));
  });
});
