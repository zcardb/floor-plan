import { useMemo } from "react";
import { CircleDollarSign, SlidersHorizontal } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { calculateCosts } from "../model/costs";
import { yuan } from "../model/money";
import type { Design } from "../model/types";
import { useCostDesign } from "./CostDefaultsContext";

/**
 * 面板顶部模式标签。成本标签上常驻显示全屋总额，让成本在属性页也保持弱透出；
 * 有未定价项时附一个提示点。
 */
export function PanelModeTabs({
  design,
  mode,
  onChange,
}: {
  design: Design;
  mode: "props" | "cost";
  onChange: (m: "props" | "cost") => void;
}) {
  const effective = useCostDesign(design),
    c = useMemo(() => calculateCosts(effective), [effective]),
    unpriced = [...c.soft, ...c.hard].filter(
      (r) => r.price === null && r.quantity > 0,
    ).length;
  return (
    <div className="panel-mode-tabs" role="tablist" aria-label="右侧面板模式">
      <EditorTooltip label="属性" description="查看和修改选中对象的尺寸、材质与位置">
        <button
          role="tab"
          aria-selected={mode === "props"}
          className={mode === "props" ? "active" : ""}
          onClick={() => onChange("props")}
        >
          <SlidersHorizontal size={14} />
          属性
        </button>
      </EditorTooltip>
      <EditorTooltip
        label="成本"
        description={
          unpriced > 0
            ? `全屋已录入费用合计；还有 ${unpriced} 类费用未定价`
            : "全屋已录入费用合计，可按房间查看明细"
        }
      >
        <button
          role="tab"
          aria-selected={mode === "cost"}
          className={mode === "cost" ? "active" : ""}
          onClick={() => onChange("cost")}
        >
          <CircleDollarSign size={14} />
          成本
          <b>{yuan(c.total)}</b>
          {unpriced > 0 && (
            <i
              className="panel-mode-dot"
              aria-label={`${unpriced} 类费用未定价`}
            />
          )}
        </button>
      </EditorTooltip>
    </div>
  );
}
