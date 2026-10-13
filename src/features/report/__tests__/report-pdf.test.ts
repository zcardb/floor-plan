import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PageSizes, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { afterAll, describe, expect, it, vi } from "vitest";
import { blankDesign, referenceDesign } from "@/lib/floor-plan/templates";
import { COST_CATEGORIES } from "@/lib/floor-plan/cost-categories";
import { furnitureKey, setPrice } from "@/lib/floor-plan/costs";
import { createExportDocument } from "@/lib/drawing/drawing-document";
import { loadPdfFont } from "@/lib/drawing/drawing-export";
import { serializePdf } from "@/lib/drawing/pdf-export";
import { yuan } from "@/lib/floor-plan/money";
import { REPORT_CONTENTS, REPORT_CONTENTS_TITLE, REPORT_NOTES, buildReport, figureCards, infoItems, layoutPassNote, unpricedNote, type ReportSection } from "../model/report";
import { reportFile } from "../model/report-export";
import { reportPdf } from "../model/report-pdf";
import { stairLibrary } from "@/lib/floor-plan/stairs";
import type { Design } from "@/lib/floor-plan/types";

const FONT_FILE = resolve(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf");
// 与线上同一条路径取字体：loadPdfFont 请求 /fonts/NotoSansSC-Regular.ttf，这里用仓库里的字体文件应答。
vi.stubGlobal("fetch", async () => (existsSync(FONT_FILE) ? new Response(readFileSync(FONT_FILE)) : new Response(null, { status: 404 })));
// 字体文件缺失（例如精简检出的仓库）时 loadPdfFont 会失败：PDF 用例整体跳过并在标题里说明，而不是报红。
const fontBytes = await loadPdfFont().catch(() => null);
afterAll(() => vi.unstubAllGlobals());

const DATE = new Date(2026, 9, 12);
/** 统一页边距与页脚带（pdfFlow.ts）：正文与平面图都不能越过。 */
const MARGIN = 48, FOOTER_BAND = 28;
const decode = (stream: PDFRawStream) => new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
/** 一页的内容流（绘图指令原文）。 */
function pageOps(pdf: PDFDocument, page: PDFPage): string {
  const contents = page.node.get(PDFName.of("Contents"));
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  return streams.map((ref) => decode(pdf.context.lookup(ref) as PDFRawStream)).join("\n");
}
/** 读出一页上直接写的文字：按 Tf 切换字体，用该字体的 ToUnicode 把 Tj 里的字形编号还原成字符。平面图表单里的字不在其中。 */
function pageText(pdf: PDFDocument, page: PDFPage): string {
  const maps = new Map<string, Map<string, string>>();
  const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  for (const [name, ref] of fonts.entries()) {
    const toUnicode = pdf.context.lookup(ref, PDFDict).get(PDFName.of("ToUnicode")) as PDFRef;
    const cmap = decode(pdf.context.lookup(toUnicode) as PDFRawStream), map = new Map<string, string>();
    for (const [, glyph, unicode] of cmap.slice(cmap.indexOf("beginbfchar")).matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi))
      map.set(glyph.toLowerCase(), String.fromCharCode(...unicode.match(/.{4}/g)!.map((h) => parseInt(h, 16))));
    maps.set(name.asString(), map);
  }
  let text = "", font: Map<string, string> | undefined;
  for (const [, name, hex] of pageOps(pdf, page).matchAll(/(\/[^\s/]+)\s+[-\d.]+\s+Tf|<([0-9a-fA-F]*)>\s*Tj/g)) {
    if (name) font = maps.get(name);
    else text += hex.match(/.{4}/g)?.map((g) => font?.get(g.toLowerCase()) ?? "").join("") ?? "";
  }
  return text;
}
const isA4 = (page: PDFPage) => {
  const [short, long] = [page.getWidth(), page.getHeight()].sort((a, b) => a - b);
  return Math.abs(short - PageSizes.A4[0]) < 0.01 && Math.abs(long - PageSizes.A4[1]) < 0.01;
};
const isLandscape = (page: PDFPage) => page.getWidth() > page.getHeight();
const layerNames = (pdf: PDFDocument) =>
  pdf.catalog.lookup(PDFName.of("OCProperties"), PDFDict).lookup(PDFName.of("OCGs"), PDFArray).asArray()
    .map((ref) => (pdf.context.lookup(ref, PDFDict).get(PDFName.of("Name")) as unknown as { decodeText(): string }).decodeText());
/** 文件里实际存的页对象数：平面图拷贝来的原页用完即删，不应多出页面树之外的页。 */
const pageObjects = (pdf: PDFDocument) =>
  pdf.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Page")).length;
/** 一页上的表单 XObject（平面图就是一张矢量表单）。 */
function forms(pdf: PDFDocument, page: PDFPage) {
  const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return (xobjects?.entries() ?? [])
    .map(([name, ref]) => ({ name: name.asString(), stream: pdf.context.lookup(ref) as PDFRawStream }))
    .filter(({ stream }) => stream.dict.get(PDFName.of("Subtype")) === PDFName.of("Form"));
}
/** 平面图画在页面上的范围（pt，原点在左下角）：表单的外框乘上画它时的平移与缩放。 */
function planBox(pdf: PDFDocument, page: PDFPage) {
  const [form] = forms(pdf, page), number = "(-?[\\d.]+(?:e-?\\d+)?)";
  const placed = new RegExp(`1 0 0 1 ${number} ${number} cm\\s+1 0 0 1 0 0 cm\\s+${number} 0 0 ${number} 0 0 cm\\s+1 0 0 1 0 0 cm\\s+${form.name} Do`).exec(pageOps(pdf, page))!;
  const [x, y, xScale, yScale] = placed.slice(1).map(Number);
  const [left, bottom, right, top] = form.stream.dict.lookup(PDFName.of("BBox"), PDFArray).asArray().map((n) => Number(n.toString()));
  return { x, y, width: (right - left) * xScale, height: (top - bottom) * yScale, xScale, yScale };
}
/** 信息带的底边（pt，原点在左下角）：它是第 1 页画的第一块底色。 */
const bandBottom = (pdf: PDFDocument, page: PDFPage) => Number(/1 0 0 1 [\d.]+ ([\d.]+) cm\s+1 0 0 1 0 0 cm\s+1 0 0 1 0 0 cm\s+0 0 m/.exec(pageOps(pdf, page))![1]);
/** 平面图等比缩放、水平居中，四周不出页边距；上面让出信息带与一行图名，下面让出页脚。返回它在页面上的范围。 */
function expectPlanInBody(pdf: PDFDocument) {
  const page = pdf.getPage(0), box = planBox(pdf, page);
  expect(box.xScale).toBeCloseTo(box.yScale, 6);
  expect(box.x).toBeGreaterThanOrEqual(MARGIN - 0.01);
  expect(box.x + box.width).toBeLessThanOrEqual(page.getWidth() - MARGIN + 0.01);
  expect(box.x + box.width / 2).toBeCloseTo(page.getWidth() / 2, 1);
  expect(box.y).toBeGreaterThanOrEqual(MARGIN + FOOTER_BAND - 0.01);
  expect(box.y + box.height).toBeLessThanOrEqual(bandBottom(pdf, page) - 30);
  return box;
}

/** 各分节在正文里的样子：标题后面紧跟它的补充说明或第一格内容，以此与目录条目、续页标题区分。 */
const HEADINGS: [ReportSection, RegExp][] = [
  ["plan", /平面图(比例 1:\d+（A4）|暂无平面图)/],
  ["budget", /预算构成合计 ¥/],
  ["figures", /关键数字总价¥/],
  ["rooms", /逐间清单\d+ 间 · 套内净面积/],
  ["layout", /布局体检(\d+ 条 · )?已检查 \d+ 件家具/],
  ["furniture", /家具清单\d+ 件 · ¥/],
];
/** 各分节实际从第几页开始。 */
const startPages = (pages: string[]) => Object.fromEntries(HEADINGS.map(([section, heading]) => [section, pages.findIndex((text) => heading.test(text)) + 1]));
/** 目录（第 2 页开头）给各分节写的页码。 */
const contentsPages = (second: string) =>
  Object.fromEntries(REPORT_CONTENTS.map(([section, title]) => [section, Number(new RegExp(`${title}第 (\\d+) 页`).exec(second)?.[1])]));
/** 若干段文字在同一页上按给定顺序出现。 */
function expectOrder(text: string, parts: string[]) {
  const at = parts.map((part) => text.indexOf(part));
  expect(at.map((i, n) => (i < 0 ? `缺少：${parts[n]}` : i))).toEqual([...at].sort((a, b) => a - b));
}

function pricedReference(): Design {
  const d = setPrice(referenceDesign(), "floorPrices", "wood", 260);
  return setPrice(d, "furniturePrices", furnitureKey(d.furniture[0]), 3600);
}
/** 九个预算科目全部有条目（屋面、吊顶、楼梯、拆改、人工都齐），且有未定价项：第 2 页最挤的情况。 */
function everyCategory(): Design {
  const d = pricedReference(), [stair] = stairLibrary;
  d.rooms[0] = { ...d.rooms[0], roofMat: "tile", ceilingMat: "gypsum" };
  d.furniture.push({ id: "stairs", type: stair.type, name: stair.name, catalogId: stair.catalogId, stair: stair.stair, cx: 8000, cy: 5000, w: stair.w, d: stair.d, rot: 0, color: stair.color });
  d.demolished = [d.walls[d.walls.length - 1].id];
  return { ...d, costSettings: { ...d.costSettings, labor: [{ id: "l1", name: "水电改造", amount: 18000 }] } };
}
/** 空白户型里摆 90 个尺寸各异、都不靠墙的柜子：布局体检与家具清单都要跨页。 */
function longLists(): Design {
  const d = blankDesign();
  d.furniture = Array.from({ length: 90 }, (_, i) => ({
    id: `f${i}`, type: "cabinet", name: `储物柜 ${i + 1} 号`, cx: 600 + (i % 9) * 600, cy: 600 + Math.floor(i / 9) * 500, w: 400 + i * 10, d: 400, rot: 0, color: "#ccc",
  }));
  return d;
}
async function report(design: Design, name?: string) {
  const model = buildReport(design, undefined, { name, date: DATE });
  const pdf = await PDFDocument.load(await reportPdf(model, { fontBytes: fontBytes! }));
  return { model, pdf, pages: pdf.getPages().map((page) => pageText(pdf, page)) };
}

describe.skipIf(!fontBytes)("方案报告 PDF（需要 public/fonts/NotoSansSC-Regular.ttf，字体缺失时跳过）", () => {
  it("第 1 页是平面图 + 关键信息：项目名作页标题，一条信息带，下面是图名、比例与矢量平面图", async () => {
    const { model, pdf, pages } = await report(pricedReference(), "我的家");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.getPages().every(isA4)).toBe(true);
    expect(pdf.getTitle()).toBe("我的家 · 方案报告");
    const items = infoItems(model);
    expect(model.figures.unpriced).toBeGreaterThan(0);
    expectOrder(pages[0], [
      "我的家",
      "方案报告 · 2026-10-12",
      ...items.flatMap(([label, value, note]) => [label, value, ...(note ? [note] : [])]),
      // 参考户型在竖版 A4 上仍按 1:100 出图：信息带没有把平面图挤小。
      "平面图比例 1:100（A4） · 尺寸单位 m · 图层可在阅读器中开关",
    ]);
    expect(pages[0]).toContain(`预算总价${yuan(model.figures.total)}另有 ${model.figures.unpriced} 项未定价`);
    // 首页没有封面内容：目录、关键数字卡都在第 2 页。
    expect(pages[0]).not.toContain(REPORT_CONTENTS_TITLE);
    expect(pages[0]).not.toContain("家具件数");
  });

  it("平面图是一张矢量表单，落在信息带之下、页脚之上并水平居中；图层随之保留，原页不重复存储", async () => {
    const d = pricedReference(), { pdf } = await report(d, "我的家");
    const first = pdf.getPage(0), box = expectPlanInBody(pdf);
    expect(forms(pdf, first)).toHaveLength(1);
    expect(pdf.getPages().slice(1).every((page) => forms(pdf, page).length === 0)).toBe(true);
    // 平面图是页面主体：横向几乎铺满正文宽度，高度占去正文区域一半以上。
    expect(box.width).toBeGreaterThan((first.getWidth() - 2 * MARGIN) * 0.9);
    expect(box.height).toBeGreaterThan((first.getHeight() - 2 * MARGIN) / 2);
    // 图层清单与平面图自己导出的那份完全一致（名称与顺序）：报告不多不少地搬运了图纸的图层。
    const alone = await PDFDocument.load(await serializePdf(createExportDocument(d), { fontBytes: fontBytes! }));
    const layers = layerNames(pdf);
    expect(layers).toEqual(layerNames(alone));
    expect(layers).toEqual(expect.arrayContaining(["墙体", "家具", "房间名称", "尺寸标注"]));
    // 图层对象挂在表单自己的资源里，标记内容才对得上；默认全部可见。
    const [form] = forms(pdf, first), ocgs = pdf.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
    const properties = form.stream.dict.lookup(PDFName.of("Resources"), PDFDict).lookup(PDFName.of("Properties"), PDFDict);
    expect(properties.values().map(String).sort()).toEqual(ocgs.lookup(PDFName.of("OCGs"), PDFArray).asArray().map(String).sort());
    const on = ocgs.lookup(PDFName.of("D"), PDFDict).lookup(PDFName.of("ON"), PDFArray);
    expect(on.size()).toBe(layers.length);
    expect(on.asArray().map(String).sort()).toEqual(ocgs.lookup(PDFName.of("OCGs"), PDFArray).asArray().map(String).sort());
    expect(decode(form.stream)).toMatch(/\/OC\s+\/\S+\s+BDC/);
    expect(pageObjects(pdf)).toBe(pdf.getPageCount());
  });

  it("第 2 页依次是目录、预算构成（含计价依据）、关键数字；目录页码就是各分节实际所在的页", async () => {
    const { model, pages } = await report(pricedReference(), "我的家");
    const second = pages[1];
    expect(second.startsWith(`${REPORT_CONTENTS_TITLE}${REPORT_CONTENTS[0][1]}第 1 页`)).toBe(true);
    expectOrder(second, [
      ...REPORT_CONTENTS.map(([, title]) => `${title}第 `),
      `预算构成合计 ${yuan(model.budget.total)}`,
      "科目口径说明类别金额占比",
      ...model.budget.lines.map((line) => line.label),
      REPORT_NOTES.basis,
      // 原封面上的六个关键数字并到这里，第一张是总价。
      `关键数字${figureCards(model.figures).map((card) => card.join("")).join("")}`,
      unpricedNote(model.figures.unpriced),
      REPORT_NOTES.areas,
    ]);
    expect(contentsPages(second)).toEqual(startPages(pages));
    expect(startPages(pages)).toMatchObject({ plan: 1, budget: 2, figures: 2, rooms: 3 });
  });

  it("九个预算科目都有条目时，目录、预算构成与关键数字仍排在第 2 页", async () => {
    const { model, pages } = await report(everyCategory(), "我的家");
    expect(model.budget.lines.map((line) => line.label)).toEqual(COST_CATEGORIES.map((category) => category.label));
    expect(model.figures.unpriced).toBeGreaterThan(0);
    expect(pages[1]).toContain(REPORT_NOTES.areas);
    expect(startPages(pages)).toMatchObject({ plan: 1, budget: 2, figures: 2, rooms: 3 });
    expect(contentsPages(pages[1])).toEqual(startPages(pages));
  });

  it("第 3 页起依次是逐间清单、布局体检、家具清单；每页页脚写项目名与页码", async () => {
    const d = pricedReference(), { pdf, pages } = await report(d, "我的家");
    expect(pages[2]).toMatch(/^逐间清单\d+ 间/);
    expectOrder(pages.slice(2).join(""), [
      "逐间清单", "房间面积硬装软装合计", ...d.rooms.map((room) => room.name), "全屋公共项", "全屋合计", REPORT_NOTES.shared,
      "布局体检", "家具清单", "名称型号数量单价小计",
    ]);
    pages.forEach((text, i) => expect(text.endsWith(`我的家 · 方案报告第 ${i + 1} / ${pdf.getPageCount()} 页`)).toBe(true));
  });

  it("表格跨页时续页重复「标题（续）」与表头，目录页码跟着后移", async () => {
    const { model, pdf, pages } = await report(longLists(), "长清单");
    expect(model.layout.issues.length).toBeGreaterThan(60);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(6);
    expect(pdf.getPages().every(isA4)).toBe(true);
    expect(pages.some((text) => text.startsWith("布局体检（续）房间家具问题"))).toBe(true);
    expect(pages.some((text) => text.startsWith("家具清单（续）名称型号数量单价小计"))).toBe(true);
    expect(pages.join("")).toContain("储物柜 90 号");
    // 三张清单不再挤在同一页：目录写的仍是各自真正开始的那一页。
    const starts = startPages(pages);
    expect(starts.layout).toBe(3);
    expect(starts.furniture).toBeGreaterThan(starts.layout + 1);
    expect(contentsPages(pages[1])).toEqual(starts);
    pages.forEach((text, i) => expect(text.endsWith(`长清单 · 方案报告第 ${i + 1} / ${pdf.getPageCount()} 页`)).toBe(true));
  });

  it("第 1 页按户型取横竖：横向大开间用横版 A4，竖向户型用竖版，其余页一律竖版；平面图都放得下", async () => {
    const wide = await report(blankDesign({ width: 16000, depth: 5000 }), "横向大开间");
    expect(isLandscape(wide.pdf.getPage(0))).toBe(true);
    expect(wide.pdf.getPages().every(isA4)).toBe(true);
    expect(wide.pdf.getPages().slice(1).some(isLandscape)).toBe(false);
    expectPlanInBody(wide.pdf);
    expect(wide.pages[0].endsWith(`横向大开间 · 方案报告第 1 / ${wide.pdf.getPageCount()} 页`)).toBe(true);
    const tall = await report(blankDesign({ width: 5000, depth: 14000 }), "纵向长条户型");
    expect(tall.pdf.getPages().some(isLandscape)).toBe(false);
    // 竖向户型由高度决定比例：图几乎顶满信息带与页脚之间的空间。
    const box = expectPlanInBody(tall.pdf);
    expect(box.height).toBeGreaterThan(box.width);
    expect(tall.pages[0]).toMatch(/平面图比例 1:\d+（A4）/);
  });

  it("没有有效墙体时不再跳过第 1 页：关键信息照旧，平面图的位置写「暂无平面图」，目录从第 2 页接着排", async () => {
    const { model, pdf, pages } = await report({ ...pricedReference(), walls: [] }, "没有墙体的方案");
    expect(model.plan).toBeNull();
    expect(pdf.getPages().every(isA4)).toBe(true);
    expect(pdf.getPages().some(isLandscape)).toBe(false);
    expectOrder(pages[0], ["没有墙体的方案", ...infoItems(model).map(([label]) => label), `平面图${REPORT_NOTES.noPlan}`]);
    expect(pages[0]).not.toContain("比例 1:");
    expect(forms(pdf, pdf.getPage(0))).toHaveLength(0);
    expect(pdf.catalog.has(PDFName.of("OCProperties"))).toBe(false);
    expect(pages[1].startsWith(REPORT_CONTENTS_TITLE)).toBe(true);
    expect(startPages(pages)).toMatchObject({ plan: 1, budget: 2, figures: 2, rooms: 3 });
    expect(contentsPages(pages[1])).toEqual(startPages(pages));
  });

  it("项目名很长：页标题最多两行并截断，页脚截断后不压页码，平面图仍在信息带之下", async () => {
    const name = "这是一个名字特别特别长的方案用来检查页标题换行与截断是否正常以及页脚是否溢出到页码上面去".repeat(2);
    const { pdf, pages } = await report(pricedReference(), name);
    expect(pages[0].startsWith(name.slice(0, 12))).toBe(true);
    expect(pages[0]).not.toContain(name);
    expect(pages[0].match(/…/g)).toHaveLength(2);
    pages.forEach((text, i) => expect(text).toMatch(new RegExp(`…第 ${i + 1} / ${pdf.getPageCount()} 页$`)));
    expectPlanInBody(pdf);
  });

  it("空方案（没有家具、没有定价）也能导出", async () => {
    const d = blankDesign();
    d.furniture = [];
    const { pdf, pages } = await report({ ...d, costSettings: {} });
    expect(pdf.getPageCount()).toBe(3);
    expect(pages[0].startsWith("未命名方案")).toBe(true);
    expect(pages[2]).toContain(REPORT_NOTES.noFurniture);
    expect(pages[2]).toContain(layoutPassNote(0));
    expect(contentsPages(pages[1])).toEqual(startPages(pages));
  });

  it("reportFile：buildReport → loadPdfFont → reportPdf；文件名带项目名，账号默认价参与计算，没有有效墙体也照常导出", async () => {
    const d = pricedReference(), first = furnitureKey(d.furniture[0]);
    const other = d.furniture.find((f) => furnitureKey(f) !== first)!;
    const defaults = { furniturePrices: { [furnitureKey(other)]: 1800 } };
    const withDefaults = buildReport(d, defaults);
    expect(withDefaults.figures.total).toBeGreaterThan(buildReport(d).figures.total);
    const file = await reportFile(d, "我/的家", defaults);
    expect(file.name).toBe("我-的家-方案报告.pdf");
    expect(file.blob.type).toBe("application/pdf");
    expect(file.blob.size).toBeLessThan(fontBytes!.byteLength);
    const full = await PDFDocument.load(new Uint8Array(await file.blob.arrayBuffer()));
    expect(full.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(full.getPages().every(isA4)).toBe(true);
    const cover = pageText(full, full.getPage(0));
    expect(cover.startsWith("我/的家")).toBe(true);
    expect(cover).toContain(`预算总价${yuan(withDefaults.figures.total)}`);
    expect(forms(full, full.getPage(0))).toHaveLength(1);
    const noWalls = await reportFile({ ...d, walls: [] }, "  ");
    expect(noWalls.name).toBe("未命名方案-方案报告.pdf");
    const partial = await PDFDocument.load(new Uint8Array(await noWalls.blob.arrayBuffer()));
    expect(pageText(partial, partial.getPage(0))).toContain(`平面图${REPORT_NOTES.noPlan}`);
    expect(pageText(partial, partial.getPage(1)).startsWith(REPORT_CONTENTS_TITLE)).toBe(true);
  });
});
