import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { yuan } from "./money";
import { A4_LANDSCAPE, A4_PORTRAIT, COLORS, HEADING_HEIGHT, MARGIN, createFlow, pageBody, type Flow } from "./pdfFlow";
import { alignGlyphs } from "./pdfFont";
import { embedPlan, fitPlan } from "./pdfPlan";
import {
  REPORT_CONTENTS,
  REPORT_CONTENTS_TITLE,
  REPORT_NOTES,
  REPORT_SECTIONS,
  figureCards,
  formatArea,
  formatShare,
  infoItems,
  layoutPassNote,
  planCaption,
  unpricedNote,
  type ReportBudgetLine,
  type ReportFurnitureLine,
  type ReportIssue,
  type ReportModel,
  type ReportSection,
} from "./report";

/**
 * 方案报告 PDF（A4），页序固定：
 * 第 1 页是平面图 + 关键信息——项目名作页标题，下面一条信息带，其余整页留给矢量平面图（图层仍可在阅读器里开关）；
 * 第 2 页是目录 + 预算构成（含计价依据）+ 关键数字；
 * 之后依次是逐间清单、布局体检、家具清单，表格跨页时重复标题（续）与表头。每页页脚写项目名与页码。
 */
export interface ReportPdfOptions {
  /** 中文字体（loadPdfFont 的结果），以子集嵌入。 */
  fontBytes: ArrayBuffer | Uint8Array;
}

export async function reportPdf(model: ReportModel, options: ReportPdfOptions): Promise<Uint8Array> {
  // 调用方给的可能是未处理的字体字节（例如测试直接读文件）；已补齐的会原样返回。
  const fontBytes = alignGlyphs(options.fontBytes);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const label = `${model.info.name} · 方案报告`;
  pdf.setTitle(label);
  pdf.setSubject("方案报告");
  pdf.setLanguage("zh-CN");
  pdf.setCreator("筑间 STUDIO");
  pdf.setProducer("筑间 STUDIO");
  const flow = createFlow(pdf, font);
  await firstPage(pdf, flow, model, fontBytes);
  // 目录在第 2 页，页码却要排完后面的页才知道：先在一份不保存的草稿上排一遍量出页码，再正式排版。
  const draft = createFlow(await PDFDocument.create(), font);
  draft.addPage();
  body(flow, model, body(draft, model));
  flow.footers(label);
  return pdf.save();
}

/**
 * 第 2 页起的正文：第 2 页是目录 + 预算构成 + 关键数字，换页后依次是逐间清单、布局体检、家具清单。
 * 返回各分节的起始页码。`pages` 是上一遍量出的页码，写进目录；草稿那一遍还不知道，页码留空。
 */
function body(flow: Flow, model: ReportModel, pages?: Record<ReportSection, number>): Record<ReportSection, number> {
  flow.addPage();
  contents(flow, pages);
  const budget = budgetSection(flow, model);
  const figures = figuresSection(flow, model);
  flow.addPage();
  const rooms = roomsSection(flow, model);
  const layout = layoutSection(flow, model);
  const furniture = furnitureSection(flow, model);
  return { info: 1, plan: 1, budget, figures, rooms, layout, furniture };
}

const TITLE_SIZE = 20;
const META_SIZE = 9;
/** 信息带：标签、内容、补充说明的字号与格内边距。 */
const BAND = { label: 8, value: 11, note: 8, padX: 10, padY: 8 };
const CONTENTS_ROW = 21;

/**
 * 第 1 页：项目名作页标题，下面一条关键信息带，其余整页留给平面图。
 * 横竖两种 A4 各排一遍页头，取平面图印得更大的那种；没有平面图时用竖版，并写明原因。
 */
async function firstPage(pdf: PDFDocument, flow: Flow, model: ReportModel, fontBytes: Uint8Array) {
  const plan = model.plan && (await embedPlan(pdf, model.plan, { fontBytes, title: `${model.info.name} · ${REPORT_SECTIONS.plan}` }));
  const layouts = [A4_PORTRAIT, A4_LANDSCAPE].map((size) => {
    const body = pageBody(size), header = pageHeader(flow, model, body.width);
    const room = { width: body.width, height: body.height - header.height - HEADING_HEIGHT };
    return { size, header, room, fit: plan && fitPlan(plan, room.width, room.height) };
  });
  const { size, header, room, fit } = layouts.reduce((best, next) => ((next.fit?.factor ?? 0) > (best.fit?.factor ?? 0) ? next : best));
  const page = flow.addPage(size);
  header.draw();
  flow.heading(REPORT_SECTIONS.plan, fit ? planCaption(fit.scale) : undefined);
  if (!plan || !fit) return placeholder(flow, REPORT_NOTES.noPlan);
  const drawn = plan.form.scale(fit.factor);
  page.drawPage(plan.form, {
    x: (page.getWidth() - drawn.width) / 2,
    y: page.getHeight() - flow.y - (room.height + drawn.height) / 2,
    xScale: fit.factor,
    yScale: fit.factor,
  });
}

/** 页头：项目名（最多两行）与右侧的「方案报告 · 日期」，下面是关键信息带。先量出高度，再画到当前页。 */
function pageHeader(flow: Flow, model: ReportModel, width: number) {
  const meta = `方案报告 · ${model.info.date}`, room = width - flow.widthOf(meta, META_SIZE) - 16;
  // 项目名最多两行，再长就在第二行截断。
  const [first, ...rest] = flow.wrap(model.info.name, TITLE_SIZE, room);
  const title = rest.length ? [first, flow.truncate(rest.join(""), TITLE_SIZE, room)] : [first];
  const band = infoBand(flow, infoItems(model), width), titleHeight = title.length * flow.lineHeight(TITLE_SIZE);
  const height = titleHeight + 8 + band.height + 16;
  return {
    height,
    draw() {
      title.forEach((line, i) => flow.text(line, MARGIN, flow.y + i * flow.lineHeight(TITLE_SIZE), TITLE_SIZE));
      flow.text(meta, MARGIN + width, flow.y + flow.baselineOf(TITLE_SIZE) - flow.baselineOf(META_SIZE), META_SIZE, COLORS.muted, "right");
      band.draw(flow.y + titleHeight + 8);
      flow.y += height;
    },
  };
}

/**
 * 关键信息带：一行带标签的格子，浅底、细线分隔。列宽按内容宽度的比例分配并铺满整行；
 * 内容放不下时等比压缩、格内换行，所以带子只会变高、不会溢出页面。最后一格（预算总价）用主色。
 */
function infoBand(flow: Flow, items: ReturnType<typeof infoItems>, width: number) {
  const natural = items.map(([label, value, note]) =>
    Math.max(flow.widthOf(label, BAND.label), flow.widthOf(value, BAND.value), note ? flow.widthOf(note, BAND.note) : 0) + 2 * BAND.padX);
  const total = natural.reduce((sum, w) => sum + w, 0);
  const widths = natural.map((w) => (w / total) * width);
  const cells = items.map(([label, value, note], i) => {
    const inner = widths[i] - 2 * BAND.padX;
    return { label, value: flow.wrap(value, BAND.value, inner), note: note ? flow.wrap(note, BAND.note, inner) : [] };
  });
  const rows = (key: "value" | "note") => Math.max(...cells.map((cell) => cell[key].length));
  const labelHeight = flow.lineHeight(BAND.label), valueHeight = rows("value") * flow.lineHeight(BAND.value);
  const height = 2 * BAND.padY + labelHeight + valueHeight + rows("note") * flow.lineHeight(BAND.note);
  return {
    height,
    draw(top: number) {
      flow.rect(MARGIN, top, width, height, COLORS.fill);
      let x = MARGIN;
      cells.forEach((cell, i) => {
        if (i) flow.rect(x - 0.3, top + BAND.padY, 0.6, height - 2 * BAND.padY, COLORS.rule);
        const left = x + BAND.padX, body = top + BAND.padY + labelHeight;
        flow.text(cell.label, left, top + BAND.padY, BAND.label, COLORS.muted);
        cell.value.forEach((line, j) =>
          flow.text(line, left, body + j * flow.lineHeight(BAND.value), BAND.value, i === cells.length - 1 ? COLORS.primary : COLORS.ink));
        cell.note.forEach((line, j) =>
          flow.text(line, left, body + cell.value.length * flow.lineHeight(BAND.value) + j * flow.lineHeight(BAND.note), BAND.note, COLORS.muted));
        x += widths[i];
      });
    },
  };
}

/** 没有平面图：一块浅底说明，写明原因与下一步，而不是留一页空白。 */
function placeholder(flow: Flow, note: string) {
  const size = 10, width = flow.contentWidth(), lines = flow.wrap(note, size, width - 48), height = lines.length * flow.lineHeight(size) + 48;
  flow.rect(MARGIN, flow.y, width, height, COLORS.fill);
  lines.forEach((line, i) => flow.text(line, MARGIN + (width - flow.widthOf(line, size)) / 2, flow.y + 24 + i * flow.lineHeight(size), size, COLORS.muted));
  flow.y += height;
}

/** 目录：标题样式同分节标题，一节一行、行间细线，右侧是该节所在的页码。 */
function contents(flow: Flow, pages?: Record<ReportSection, number>) {
  const right = MARGIN + flow.contentWidth(), size = 10, inset = (CONTENTS_ROW - flow.lineHeight(size)) / 2;
  flow.heading(REPORT_CONTENTS_TITLE);
  for (const [section, title] of REPORT_CONTENTS) {
    flow.text(title, MARGIN, flow.y + inset, size);
    if (pages) flow.text(`第 ${pages[section]} 页`, right, flow.y + inset, size, COLORS.muted, "right");
    flow.y += CONTENTS_ROW;
    flow.rule(MARGIN, right, flow.y);
  }
  flow.y += 22;
}

function budgetSection(flow: Flow, { budget }: ReportModel) {
  return flow.section(REPORT_SECTIONS.budget, `合计 ${yuan(budget.total)}`, () => {
    if (!budget.lines.length) flow.paragraph("暂无成本条目。");
    else
      flow.table<ReportBudgetLine>(
        [
          { title: "科目", width: 72, text: (l) => l.label },
          { title: "口径说明", text: (l) => (l.unpriced ? `${l.basis}；${l.unpriced} 项未定价，未计入` : l.basis) },
          { title: "类别", width: 44, text: (l) => (l.kind === "soft" ? "软装" : "硬装"), muted: () => true },
          { title: "金额", width: 86, align: "right", text: (l) => yuan(l.amount) },
          { title: "占比", width: 56, align: "right", text: (l) => formatShare(l.share) },
        ],
        budget.lines,
        ["合计", "", "", yuan(budget.total), budget.total > 0 ? formatShare(1) : "—"],
      );
    flow.paragraph(REPORT_NOTES.basis);
  });
}

/** 关键数字：六张卡三列两行，第一张总价是主指标；下面注明未定价与面积、户型的口径。 */
function figuresSection(flow: Flow, { figures }: ReportModel) {
  const gap = 8, cardHeight = 50, block = 2 * cardHeight + gap;
  return flow.section(REPORT_SECTIONS.figures, "", () => {
    const cardWidth = (flow.contentWidth() - 2 * gap) / 3;
    figureCards(figures).forEach(([name, value, unit], i) => {
      const x = MARGIN + (i % 3) * (cardWidth + gap), top = flow.y + Math.floor(i / 3) * (cardHeight + gap);
      flow.rect(x, top, cardWidth, cardHeight, i === 0 ? COLORS.accent : COLORS.fill);
      flow.text(name, x + 10, top + 7, 9, COLORS.muted);
      flow.text(value, x + 10, top + 21, 16, i === 0 ? COLORS.primary : COLORS.ink);
      if (unit) flow.text(unit, x + 13 + flow.widthOf(value, 16), top + 21 + flow.baselineOf(16) - flow.baselineOf(9), 9, COLORS.muted);
    });
    flow.y += block + 10;
    if (figures.unpriced) flow.paragraph(unpricedNote(figures.unpriced));
    flow.paragraph(REPORT_NOTES.areas);
  }, block);
}

function roomsSection(flow: Flow, { rooms, info, figures }: ReportModel) {
  const rows = [
    ...rooms.lines.map((l) => ({ ...l, name: l.counted ? l.name : `${l.name} *`, area: formatArea(l.area) })),
    { ...rooms.shared, name: "全屋公共项", area: "—" },
  ];
  return flow.section(REPORT_SECTIONS.rooms, `${rooms.lines.length} 间 · 套内净面积 ${formatArea(info.netArea)}`, () => {
    flow.table<(typeof rows)[number]>(
      [
        { title: "房间", text: (r) => r.name },
        { title: "面积", width: 70, align: "right", text: (r) => r.area },
        { title: "硬装", width: 84, align: "right", text: (r) => yuan(r.hard) },
        { title: "软装", width: 84, align: "right", text: (r) => yuan(r.soft) },
        { title: "合计", width: 88, align: "right", text: (r) => yuan(r.total) },
      ],
      rows,
      ["全屋合计", "", yuan(figures.hard), yuan(figures.soft), yuan(figures.total)],
    );
    if (rooms.lines.some((l) => !l.counted)) flow.paragraph(REPORT_NOTES.uncounted);
    flow.paragraph(REPORT_NOTES.shared);
  });
}

function layoutSection(flow: Flow, { layout }: ReportModel) {
  const meta = layout.issues.length ? `${layout.issues.length} 条 · 已检查 ${layout.checked} 件家具` : `已检查 ${layout.checked} 件家具`;
  return flow.section(REPORT_SECTIONS.layout, meta, () => {
    if (!layout.issues.length) return flow.paragraph(layoutPassNote(layout.checked), 9.5, COLORS.ink);
    flow.table<ReportIssue>(
      [
        { title: "房间", width: 96, text: (i) => i.room },
        { title: "家具", width: 120, text: (i) => i.furniture },
        { title: "问题", text: (i) => i.problem },
      ],
      layout.issues,
    );
  });
}

function furnitureSection(flow: Flow, { furniture }: ReportModel) {
  return flow.section(REPORT_SECTIONS.furniture, `${furniture.quantity} 件 · ${yuan(furniture.total)}`, () => {
    if (!furniture.lines.length) return flow.paragraph(REPORT_NOTES.noFurniture, 9.5, COLORS.ink);
    flow.table<ReportFurnitureLine>(
      [
        { title: "名称", text: (l) => (l.hard ? `${l.name}（楼梯，计入硬装）` : l.name) },
        { title: "型号", width: 104, text: (l) => l.model },
        { title: "数量", width: 44, align: "right", text: (l) => String(l.quantity) },
        { title: "单价", width: 80, align: "right", text: (l) => (l.price === null ? "未定价" : yuan(l.price)), muted: (l) => l.price === null },
        { title: "小计", width: 86, align: "right", text: (l) => (l.price === null ? "—" : yuan(l.subtotal)), muted: (l) => l.price === null },
      ],
      furniture.lines,
      ["合计", "", String(furniture.quantity), "", yuan(furniture.total)],
    );
  });
}
