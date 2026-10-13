import { PageSizes, rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/**
 * A4 流式排版：分页、按字形宽度换行、表格（跨页重复表头）、页脚。
 * 只负责「把字和表格排到纸上」，不认识报告内容；单位一律是 pt（1/72 英寸），纵向位置用离页面顶边的距离。
 */

/** index.css 浅色主题的 HSL token 换成 RGB：打印稿固定用浅色，配色与编辑器一致。 */
function hsl(h: number, s: number, l: number): RGB {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgb(channel(0), channel(8), channel(4));
}
export const COLORS = {
  ink: hsl(33, 13, 17), // --foreground
  muted: hsl(32, 10, 43), // --muted-foreground
  rule: hsl(37, 24, 85), // --border
  fill: hsl(38, 25, 93), // --secondary
  primary: hsl(21, 52, 40), // --primary
  accent: hsl(24, 47, 92), // --accent
};

export const [A4_SHORT, A4_LONG] = PageSizes.A4;
export const A4_PORTRAIT: [number, number] = [A4_SHORT, A4_LONG];
export const A4_LANDSCAPE: [number, number] = [A4_LONG, A4_SHORT];
/** 统一页边距。 */
export const MARGIN = 48;
/** 页脚带：正文写到页边距之上这一段为止。 */
const FOOTER_BAND = 28;
/** 行高倍数与表格单元格内边距。 */
const LEADING = 1.5;
const CELL_X = 6;
const CELL_Y = 5;
const TEXT_SIZE = { heading: 13, meta: 9, head: 8.5, body: 9.5, footer: 8.5 };
/** 分节标题占的高度（标题一行 + 下方间距）。 */
export const HEADING_HEIGHT = TEXT_SIZE.heading * LEADING + 6;
/** 某种纸张上正文区域的宽与高：四边留页边距，底部再让出页脚带。排版前先量尺寸时用。 */
export const pageBody = ([width, height]: [number, number]) => ({ width: width - 2 * MARGIN, height: height - 2 * MARGIN - FOOTER_BAND });

export interface FlowColumn<T> {
  title: string;
  /** 固定列宽（pt）；不填的列平分剩余宽度。 */
  width?: number;
  align?: "left" | "right";
  text: (row: T) => string;
  /** 用灰字显示（例如「未定价」）。 */
  muted?: (row: T) => boolean;
}

/** 名称里的换行、制表符一律当作空格，避免一格撑成多行或画出控制字符。 */
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function createFlow(pdf: PDFDocument, font: PDFFont) {
  const pages: PDFPage[] = [];
  const unitWidth = new Map<string, number>();
  let page: PDFPage;
  let y = MARGIN;
  /** 当前分节标题：表格跨页时在新页先写「标题（续）」。 */
  let current: string | null = null;

  const widthOf = (value: string, size: number) => {
    let total = 0;
    for (const ch of value) {
      let w = unitWidth.get(ch);
      if (w === undefined) unitWidth.set(ch, (w = font.widthOfTextAtSize(ch, 1)));
      total += w;
    }
    return total * size;
  };
  /** 按字形宽度换行：中文逐字可断；英文单词尽量整词换到下一行。 */
  const wrap = (value: string, size: number, max: number): string[] => {
    const lines: string[] = [];
    let line = "", w = 0;
    for (const ch of clean(value)) {
      const cw = widthOf(ch, size);
      if (line && w + cw > max) {
        const cut = /[!-~]$/.test(line) && /[!-~]/.test(ch) ? line.lastIndexOf(" ") : -1;
        lines.push(cut > 0 ? line.slice(0, cut) : line.trimEnd());
        line = cut > 0 ? line.slice(cut + 1) : "";
        w = widthOf(line, size);
        if (!line && ch === " ") continue;
      }
      line += ch;
      w += cw;
    }
    return [...lines, line];
  };
  /** 单行放不下时截断，以省略号结尾。 */
  const truncate = (value: string, size: number, max: number) => {
    const chars = [...clean(value)];
    if (widthOf(chars.join(""), size) <= max) return chars.join("");
    while (chars.length && widthOf(`${chars.join("")}…`, size) > max) chars.pop();
    return `${chars.join("")}…`;
  };
  const contentWidth = () => page.getWidth() - 2 * MARGIN;
  /** 正文最低能写到的位置。 */
  const limit = () => page.getHeight() - MARGIN - FOOTER_BAND;
  const lineHeight = (size: number) => size * LEADING;
  /** 行框顶边到基线的距离：字身在行框里垂直居中。 */
  const baselineOf = (size: number) => (lineHeight(size) - font.heightAtSize(size)) / 2 + font.heightAtSize(size, { descender: false });

  /** 在行框（顶边 top、高 size × 行高倍数）里写一行字；align 为 right 时 x 是右边缘。 */
  function text(value: string, x: number, top: number, size: number, color = COLORS.ink, align: "left" | "right" = "left", target = page) {
    const left = align === "right" ? x - widthOf(value, size) : x;
    target.drawText(value, { x: left, y: target.getHeight() - top - baselineOf(size), size, font, color });
  }
  function rect(x: number, top: number, width: number, height: number, color: RGB, target = page) {
    target.drawRectangle({ x, y: target.getHeight() - top - height, width, height, color });
  }
  function rule(x1: number, x2: number, top: number, color = COLORS.rule, thickness = 0.6, target = page) {
    const at = target.getHeight() - top;
    target.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness, color });
  }

  function addPage(size: [number, number] = A4_PORTRAIT) {
    page = pdf.addPage(size);
    pages.push(page);
    y = MARGIN;
    return page;
  }
  /** 分节标题 + 右侧灰字补充说明（同 .visual-popover-head 的层级），两者基线对齐。 */
  function heading(title: string, meta?: string) {
    text(title, MARGIN, y, TEXT_SIZE.heading);
    if (meta) text(clean(meta), page.getWidth() - MARGIN, y + baselineOf(TEXT_SIZE.heading) - baselineOf(TEXT_SIZE.meta), TEXT_SIZE.meta, COLORS.muted, "right");
    y += HEADING_HEIGHT;
  }
  /** 剩余高度不够时换页；分节进行中会先补一行「标题（续）」。返回是否换了页。 */
  function ensure(height: number) {
    if (y + height <= limit()) return false;
    addPage();
    if (current) heading(`${current}（续）`);
    return true;
  }
  /**
   * 写一个分节：标题至少和紧跟的 keep 高度留在同一页（默认是表头加首行）。返回分节起始页码（从 1 开始）。
   */
  function section(title: string, meta: string, body: () => void, keep = 2 * (lineHeight(TEXT_SIZE.body) + 2 * CELL_Y)) {
    current = null;
    ensure(HEADING_HEIGHT + keep);
    const start = pages.length;
    heading(title, meta);
    current = title;
    body();
    current = null;
    y += 22;
    return start;
  }
  function paragraph(value: string, size = TEXT_SIZE.meta, color = COLORS.muted) {
    for (const line of wrap(value, size, contentWidth())) {
      ensure(lineHeight(size));
      text(line, MARGIN, y, size, color);
      y += lineHeight(size);
    }
  }
  function table<T>(columns: FlowColumn<T>[], rows: T[], footer?: string[]) {
    const fixed = columns.reduce((s, c) => s + (c.width ?? 0), 0),
      flexible = Math.max(1, columns.filter((c) => !c.width).length),
      widths = columns.map((c) => c.width ?? (contentWidth() - fixed) / flexible),
      lefts = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((s, w) => s + w, 0));
    /** 一行：各格换行后取最高的一格作为行高，数字列右对齐。 */
    const row = (cells: string[], size: number, color: (i: number) => RGB, fill?: RGB) => {
      const lines = cells.map((cell, i) => wrap(cell, size, widths[i] - 2 * CELL_X)),
        height = Math.max(...lines.map((l) => l.length)) * lineHeight(size) + 2 * CELL_Y;
      return {
        height,
        draw() {
          if (fill) rect(MARGIN, y, contentWidth(), height, fill);
          lines.forEach((cellLines, i) => cellLines.forEach((line, j) => {
            const right = columns[i].align === "right";
            text(line, right ? lefts[i] + widths[i] - CELL_X : lefts[i] + CELL_X, y + CELL_Y + j * lineHeight(size), size, color(i), right ? "right" : "left");
          }));
          y += height;
        },
      };
    };
    const header = () => row(columns.map((c) => c.title), TEXT_SIZE.head, () => COLORS.muted, COLORS.fill).draw();
    header();
    for (const item of rows) {
      const body = row(columns.map((c) => c.text(item)), TEXT_SIZE.body, (i) => (columns[i].muted?.(item) ? COLORS.muted : COLORS.ink));
      if (ensure(body.height)) header();
      body.draw();
      rule(MARGIN, MARGIN + contentWidth(), y);
    }
    if (footer) {
      const total = row(footer, TEXT_SIZE.body, () => COLORS.ink, COLORS.fill);
      if (ensure(total.height)) header();
      rule(MARGIN, MARGIN + contentWidth(), y, COLORS.ink, 0.8);
      total.draw();
    }
    y += 8;
  }
  /** 所有页写页脚：左侧标签（过长截断，不压到页码上），右侧「第 N / M 页」。最后统一写，才知道总页数。 */
  function footers(label: string) {
    pages.forEach((target, i) => {
      const top = target.getHeight() - MARGIN - 4, number = `第 ${i + 1} / ${pages.length} 页`;
      const room = target.getWidth() - 2 * MARGIN - widthOf(number, TEXT_SIZE.footer) - 16;
      rule(MARGIN, target.getWidth() - MARGIN, top - 6, COLORS.rule, 0.6, target);
      text(truncate(label, TEXT_SIZE.footer, room), MARGIN, top, TEXT_SIZE.footer, COLORS.muted, "left", target);
      text(number, target.getWidth() - MARGIN, top, TEXT_SIZE.footer, COLORS.muted, "right", target);
    });
  }

  return {
    pages,
    addPage,
    section,
    heading,
    paragraph,
    table,
    footers,
    text,
    rect,
    rule,
    wrap,
    truncate,
    widthOf,
    lineHeight,
    baselineOf,
    contentWidth,
    limit,
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    set y(value: number) {
      y = value;
    },
  };
}
export type Flow = ReturnType<typeof createFlow>;
