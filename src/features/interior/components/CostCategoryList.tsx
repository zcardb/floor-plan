import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import type { CostRow, PriceGroup } from "../model/costs";
import { yuan } from "../model/money";
import type { Design } from "../model/types";
import { CostRowEditor } from "./CostRowEditor";
import { LaborEditor } from "./LaborEditor";

type Labor = NonNullable<NonNullable<Design["costSettings"]>["labor"]>;
const categories: { id: PriceGroup | "labor"; label: string; hint: string }[] = [
  { id: "floorPrices", label: "地面", hint: "含损耗 / 采购取整" },
  { id: "wallPrices", label: "墙面", hint: "周长 × 层高，扣除门窗" },
  { id: "openingPrices", label: "门窗", hint: "按开口面积 m²" },
  { id: "constructionPrices", label: "拆改与新建", hint: "长度 × 层高" },
  { id: "labor", label: "人工", hint: "独立总价条目" },
  { id: "furniturePrices", label: "软装", hint: "同款家具单价联动" },
];

/** 全屋口径：按类别折叠的价格明细。 */
export function CostCategoryList({
  design,
  rows,
  labor,
  onlyUnpriced,
  change,
}: {
  design: Design;
  rows: CostRow[];
  labor: Labor;
  onlyUnpriced: boolean;
  change: (fn: (d: Design) => Design) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="cost-categories">
      {categories.map((cat) => {
        const all = rows.filter((r) => r.group === cat.id && r.quantity > 0),
          list = onlyUnpriced ? all.filter((r) => r.price === null) : all,
          isLabor = cat.id === "labor",
          unpriced = all.filter((r) => r.price === null).length,
          subtotal = isLabor
            ? labor.reduce((s, l) => s + l.amount, 0)
            : all.reduce((s, r) => s + r.subtotal, 0);
        if (onlyUnpriced && !list.length) return null;
        if (!isLabor && !all.length) return null;
        const expanded = onlyUnpriced || open.has(cat.id);
        return (
          <div className={"cost-category" + (expanded ? " is-open" : "")} key={cat.id}>
            <EditorTooltip label={cat.label} description={expanded ? "收起这一类费用" : "展开查看并填写这一类费用的单价"}>
              <button
                className="cost-category-head"
                aria-expanded={expanded}
                onClick={() => toggle(cat.id)}
              >
                <ChevronDown size={13} />
                <span>
                  {cat.label}
                  <small>{cat.hint}</small>
                </span>
                <b>
                  {subtotal > 0 || !unpriced ? yuan(subtotal) : ""}
                  {unpriced > 0 && <em>未定价 {unpriced}</em>}
                </b>
              </button>
            </EditorTooltip>
            {expanded && (
              <div className="cost-category-body">
                {isLabor ? (
                  <LaborEditor labor={labor} change={change} />
                ) : (
                  list.map((r) => (
                    <CostRowEditor
                      key={r.group + r.key}
                      design={design}
                      row={r}
                      change={change}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
