import type { CostRow, PriceGroup } from "./costs";
import { STAIR_CATEGORY } from "./stairs";

/** 成本科目：价格组之外再拆出「楼梯」（归硬装、按件计价）与「人工」（独立总价条目）。 */
export type CostCategoryId = PriceGroup | "labor" | "stairs";

/**
 * 成本科目与口径说明，顺序即展示顺序。
 * 成本侧栏的「明细」与方案报告的「预算构成」共用这一份，两边的科目名和口径始终一致；
 * 只有「软装」（家具）计入软装，其余科目都计入硬装。
 */
export const COST_CATEGORIES: { id: CostCategoryId; label: string; hint: string }[] = [
  { id: "floorPrices", label: "地面", hint: "含损耗 / 采购取整" },
  { id: "wallPrices", label: "墙面", hint: "周长 × 层高，扣除门窗" },
  { id: "openingPrices", label: "门窗", hint: "按开口面积 m²" },
  { id: "roofPrices", label: "屋面", hint: "房间面积 ÷ cos 坡度" },
  { id: "ceilingPrices", label: "吊顶", hint: "按房间面积" },
  { id: "stairs", label: "楼梯", hint: "按件计价" },
  { id: "constructionPrices", label: "拆改与新建", hint: "长度 × 层高" },
  { id: "labor", label: "人工", hint: "独立总价条目" },
  { id: "furniturePrices", label: "软装", hint: "同款家具单价联动" },
];

/** 全屋明细里的一行属于哪个科目：楼梯按展示分类归入「楼梯」，其余按价格组。 */
export const inCostCategory = (row: CostRow, id: CostCategoryId) =>
  id === "stairs" ? row.category === STAIR_CATEGORY : row.group === id && !row.category;
