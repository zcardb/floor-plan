import { calculateCosts, furnitureKey, priceOf } from "@/lib/floor-plan/costs";
import { costBreakdown, type CostBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { COST_CATEGORIES, inCostCategory, type CostCategoryId } from "@/lib/floor-plan/cost-categories";
import { effectiveCostDesign, type AccountCostSettings } from "@/lib/floor-plan/cost-defaults";
import { designStyle } from "@/lib/floor-plan/decor-styles";
import { createExportDocument, type DrawingDocument } from "@/lib/drawing/drawing-document";
import { grossArea } from "./gross-area";
import { houseTypeLabel, houseTypeOf, type HouseType } from "./house-type";
import { layoutIssues, type LayoutIssue } from "@/lib/floor-plan/layout-rules";
import { formatMeters } from "@/lib/floor-plan/length-units";
import { yuan } from "@/lib/floor-plan/money";
import { roomMetrics } from "@/lib/floor-plan/room-metrics";
import { isStairs } from "@/lib/floor-plan/stairs";
import type { Design } from "@/lib/floor-plan/types";

/**
 * 方案报告：把平面图、关键信息、成本、房间、布局体检与家具清单收成一份结构化数据，交给 reportPdf 排成 PDF。
 *
 * 只组合现成的计算（calculateCosts / costBreakdown / roomMetrics / layoutRules / decorStyles / 图纸导出），不另算一套，
 * 所以报告里的金额与成本侧栏完全一致、平面图与导出的图纸完全一致。
 * 全部字段都是数字、字符串、数组、普通对象或 null，可以直接 JSON 序列化。
 */

/**
 * 分节标题，顺序固定，即版面顺序：首页是关键信息 + 平面图，第二页是目录 + 预算构成 + 关键数字，之后是三张清单。
 * 与 ReportModel 的字段一一对应。
 */
export const REPORT_SECTIONS = {
  info: "关键信息",
  plan: "平面图",
  budget: "预算构成",
  figures: "关键数字",
  rooms: "逐间清单",
  layout: "布局体检",
  furniture: "家具清单",
} as const;
export type ReportSection = keyof typeof REPORT_SECTIONS;

export const REPORT_CONTENTS_TITLE = "目录";
/** 目录条目，按版面顺序：首页的平面图与关键信息合为一条，其余一节一条；页码在排版时配上。 */
export const REPORT_CONTENTS: [section: ReportSection, title: string][] = [
  ["plan", `${REPORT_SECTIONS.plan}与${REPORT_SECTIONS.info}`],
  ["budget", REPORT_SECTIONS.budget],
  ["figures", REPORT_SECTIONS.figures],
  ["rooms", REPORT_SECTIONS.rooms],
  ["layout", REPORT_SECTIONS.layout],
  ["furniture", REPORT_SECTIONS.furniture],
];

/** 报告里的说明文案。 */
export const REPORT_NOTES = {
  basis: "金额按方案当前单价计算：地面含损耗与采购取整；墙面扣除门窗；门窗按相邻房间平分；拆改、新建与人工为全屋公共项。",
  areas: "套内面积为计入面积的房间净使用面积之和；建筑面积按墙体外轮廓围合的范围计算（含墙体），不含公摊。户型按房间名称识别。",
  shared: "公共项：拆改、新建、人工、不贴房间的门窗与房外家具，不分摊到单个房间。",
  uncounted: "* 不计入套内净面积。",
  checks: "房间轮廓、背靠实墙、门扇开启范围、门口通行区与窗洞",
  noFurniture: "方案里还没有家具。",
  noPlan: "暂无平面图：方案里还没有墙体，画好墙体后重新生成报告即可。",
};
/** 平面图的图注：打印比例、尺寸单位与图层说明。 */
export const planCaption = (scale: number) => `比例 1:${scale}（A4） · 尺寸单位 m · 图层可在阅读器中开关`;
export const unpricedNote = (count: number) => `另有 ${count} 项未定价，没有计入以上金额；补全单价后重新生成即可。`;
export const layoutPassNote = (checked: number) =>
  checked ? `未发现问题：已按${REPORT_NOTES.checks}检查 ${checked} 件家具。` : "房间里还没有家具，暂无可检查的项目。";
export const formatArea = (m2: number) => `${m2.toFixed(2)} m²`;
export const formatShare = (share: number) => `${(share * 100).toFixed(1)}%`;

export interface ReportInfo {
  /** 项目名，由调用方传入。 */
  name: string;
  /** 生成日期（本地时区，YYYY-MM-DD）。 */
  date: string;
  /** 户型（几室几厅几卫）：按房间名称识别，见 houseType.ts。 */
  houseType: HouseType;
  /** 套内净面积（m²）：计入面积的房间（counted !== false）净使用面积之和，与成本侧栏「套内净使用面积」同口径。 */
  netArea: number;
  /** 建筑面积（m²）：墙体外轮廓围合的范围，含墙体、不含公摊，见 grossArea.ts；没有墙体也没有房间时为 0。 */
  grossArea: number;
  /** 装修风格名称。 */
  style: string;
}
export interface ReportFigures {
  /** 总价 = 硬装 + 软装（元），即成本侧栏的全屋合计。 */
  total: number;
  hard: number;
  soft: number;
  /** 每平方米造价（元 / m²，按套内净面积）；面积为 0 时为 null。 */
  perSquareMeter: number | null;
  rooms: number;
  furniture: number;
  /** 未定价条目数（同款 / 同材质计一项），这些条目没有计入总价。 */
  unpriced: number;
}
export interface ReportBudgetLine {
  id: CostCategoryId;
  /** 科目：地面、墙面、门窗……软装。 */
  label: string;
  /** 口径说明，与成本侧栏「明细」一致。 */
  basis: string;
  kind: "hard" | "soft";
  amount: number;
  /** 占总价比例（0–1）。 */
  share: number;
  /** 本科目未定价条目数。 */
  unpriced: number;
}
export interface ReportBudget {
  lines: ReportBudgetLine[];
  total: number;
}
export interface ReportRoomLine {
  id: string;
  name: string;
  /** 净使用面积（m²）。 */
  area: number;
  /** 是否计入套内面积。 */
  counted: boolean;
  hard: number;
  soft: number;
  total: number;
}
export interface ReportRooms {
  lines: ReportRoomLine[];
  /** 全屋公共项：拆改、新建、人工、不贴房间的门窗与房外家具，不计入单个房间。 */
  shared: { hard: number; soft: number; total: number };
}
/** 布局体检的一条问题：与编辑器「布局整理」侧栏同一份数据（layoutRules.layoutIssues）。 */
export type ReportIssue = LayoutIssue;
/** `checked` 为参与体检的家具件数：中心点落在某个房间里的家具（与成本归属同一规则）。 */
export type ReportLayout = ReturnType<typeof layoutIssues>;
export interface ReportFurnitureLine {
  name: string;
  /** 型号：外形宽 × 深（m）。 */
  model: string;
  quantity: number;
  /** 单价（元 / 件）；未定价为 null。 */
  price: number | null;
  subtotal: number;
  /** 楼梯在预算里归硬装（「楼梯」科目），清单里仍按件列出。 */
  hard: boolean;
}
export interface ReportFurniture {
  lines: ReportFurnitureLine[];
  quantity: number;
  total: number;
}
export interface ReportModel {
  info: ReportInfo;
  /**
   * 平面图图纸，与图纸导出同一份（createExportDocument），PDF 首页用它出矢量图。
   * 方案里没有有效墙体时为 null，首页改写「暂无平面图」。
   */
  plan: DrawingDocument | null;
  budget: ReportBudget;
  figures: ReportFigures;
  rooms: ReportRooms;
  layout: ReportLayout;
  furniture: ReportFurniture;
}
export interface ReportOptions {
  /** 项目名；为空时写「未命名方案」。 */
  name?: string;
  /** 生成日期，默认今天。 */
  date?: Date;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** 分摊取整可能留下 -0.01 这类残差，金额不会为负。 */
const residual = (n: number) => Math.max(0, round2(n));
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (t: Date) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

/**
 * 首页信息带的各项（标签、内容、补充说明），最后一项预算总价是主指标。
 * 有未定价条目时在总价下注明，避免把不完整的金额当成全部预算。
 */
export function infoItems({ info, figures }: Pick<ReportModel, "info" | "figures">): [label: string, value: string, note?: string][] {
  const gross = info.grossArea > 0 ? info.grossArea.toFixed(2) : "—";
  return [
    ["户型", houseTypeLabel(info.houseType)],
    ["套内 / 建筑面积", `${info.netArea.toFixed(2)} / ${gross} m²`],
    ["房间数", `${figures.rooms} 间`],
    ["装修风格", info.style],
    ["预算总价", yuan(figures.total), figures.unpriced ? `另有 ${figures.unpriced} 项未定价` : undefined],
  ];
}

/** 关键数字的六张卡（标签、数值、单位），第一张总价是主指标。 */
export function figureCards(f: ReportFigures): [label: string, value: string, unit: string][] {
  return [
    ["总价", yuan(f.total), ""],
    ["硬装", yuan(f.hard), ""],
    ["软装", yuan(f.soft), ""],
    ["单价", f.perSquareMeter === null ? "—" : yuan(f.perSquareMeter), f.perSquareMeter === null ? "" : "/ m²"],
    ["房间数", String(f.rooms), "间"],
    ["家具件数", String(f.furniture), "件"],
  ];
}

/**
 * 生成方案报告。`defaults` 是账号默认价（与成本侧栏的 useCostDesign 同一套合并规则），
 * 传入后所有金额都按合并后的单价计算。
 *
 * 一次要出图纸（约 30 ms）与成本分摊：只在导出时调用（见 reportExport.ts），不要放进渲染路径。
 */
export function buildReport(design: Design, defaults?: AccountCostSettings, options: ReportOptions = {}): ReportModel {
  const d = defaults ? effectiveCostDesign(design, defaults) : design;
  const breakdown = costBreakdown(d), total = breakdown.total;
  const netArea = d.rooms.filter((r) => r.counted !== false).reduce((s, r) => s + roomMetrics(r).area, 0);
  return {
    info: {
      name: options.name?.trim() || "未命名方案",
      date: localDate(options.date ?? new Date()),
      houseType: houseTypeOf(d.rooms),
      netArea: round2(netArea),
      grossArea: round2(grossArea(d)),
      style: designStyle(d).name,
    },
    plan: planOf(d),
    budget: budgetOf(d, total),
    figures: {
      total,
      hard: breakdown.hardTotal,
      soft: breakdown.softTotal,
      perSquareMeter: netArea > 0 ? round2(total / netArea) : null,
      rooms: d.rooms.length,
      furniture: d.furniture.length,
      unpriced: breakdown.unpriced,
    },
    rooms: roomsOf(d, breakdown),
    layout: layoutIssues(d),
    furniture: furnitureOf(d),
  };
}

/** 没有有效墙体时画不出平面图：首页改写「暂无平面图」，其余照常生成；其它错误照常抛出。 */
function planOf(d: Design): DrawingDocument | null {
  try {
    return createExportDocument(d);
  } catch (error) {
    if (error instanceof Error && error.message.includes("有效墙体")) return null;
    throw error;
  }
}

/** 预算构成：按成本侧栏的科目归并全屋明细，人工单列。 */
function budgetOf(d: Design, total: number): ReportBudget {
  const costs = calculateCosts(d), rows = [...costs.hard, ...costs.soft].filter((r) => r.quantity > 0);
  const lines = COST_CATEGORIES.flatMap((cat): ReportBudgetLine[] => {
    const items = rows.filter((r) => inCostCategory(r, cat.id)),
      labor = cat.id === "labor" ? costs.labor : [];
    if (!items.length && !labor.length) return [];
    const amount = items.reduce((s, r) => s + r.subtotal, 0) + labor.reduce((s, l) => s + l.amount, 0);
    return [{
      id: cat.id,
      label: cat.label,
      basis: cat.hint,
      kind: cat.id === "furniturePrices" ? "soft" : "hard",
      amount: round2(amount),
      share: total > 0 ? Math.round((amount / total) * 10000) / 10000 : 0,
      unpriced: items.filter((r) => r.price === null).length,
    }];
  });
  return { lines, total };
}

/**
 * 逐间清单：每间的面积与硬装 / 软装 / 合计。公共项金额就是成本分摊的公共项；
 * 它的硬装 / 软装取「全屋 − 各房间之和」，表格的两列竖着加也对得上。
 */
function roomsOf(d: Design, breakdown: CostBreakdown): ReportRooms {
  const lines = d.rooms.map((room): ReportRoomLine => {
    const cost = breakdown.rooms.find((r) => r.roomId === room.id);
    return {
      id: room.id,
      name: room.name,
      area: round2(roomMetrics(room).area),
      counted: room.counted !== false,
      hard: cost?.hardTotal ?? 0,
      soft: cost?.softTotal ?? 0,
      total: cost?.total ?? 0,
    };
  });
  const sum = (key: "hard" | "soft") => lines.reduce((s, l) => s + l[key], 0);
  return {
    lines,
    shared: {
      hard: residual(breakdown.hardTotal - sum("hard")),
      soft: residual(breakdown.softTotal - sum("soft")),
      total: breakdown.sharedTotal,
    },
  };
}

/** 家具清单：同款（同单价）、同名、同尺寸的家具归并成一行；未定价的排在最后，其余按小计从高到低。 */
function furnitureOf(d: Design): ReportFurniture {
  const lines = new Map<string, ReportFurnitureLine>();
  for (const f of d.furniture) {
    const key = furnitureKey(f),
      model = `${formatMeters(f.w)} × ${formatMeters(f.d)} m`,
      id = [key, f.name, model].join("\n"),
      price = priceOf(d, "furniturePrices", key),
      line = lines.get(id);
    if (line) {
      line.quantity += 1;
      line.subtotal = round2(line.subtotal + (price ?? 0));
    } else lines.set(id, { name: f.name, model, quantity: 1, price, subtotal: round2(price ?? 0), hard: isStairs(f) });
  }
  const unpriced = (l: ReportFurnitureLine) => (l.price === null ? 1 : 0);
  const sorted = [...lines.values()].sort(
    (a, b) => unpriced(a) - unpriced(b) || b.subtotal - a.subtotal || a.name.localeCompare(b.name, "zh-CN"),
  );
  return { lines: sorted, quantity: d.furniture.length, total: round2(sorted.reduce((s, l) => s + l.subtotal, 0)) };
}
