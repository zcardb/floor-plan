import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { COST_CATEGORIES as categories, inCostCategory as inCategory } from "@/lib/floor-plan/cost-categories";
import type { CostRow } from "@/lib/floor-plan/costs";
import { yuan } from "@/lib/floor-plan/money";
import type { Design } from "@/lib/floor-plan/types";
import { CostRowEditor } from "./cost-row-editor";
import { LaborEditor } from "./labor-editor";

type Labor = NonNullable<NonNullable<Design["costSettings"]>["labor"]>;

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
        const all = rows.filter((r) => inCategory(r, cat.id) && r.quantity > 0),
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
            <EditorTooltip label={cat.label}>
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
