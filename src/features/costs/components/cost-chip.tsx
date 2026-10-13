import { useDeferredValue, useMemo } from "react";
import { CircleDollarSign } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { costBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { yuanShort } from "@/lib/floor-plan/money";
import type { Design } from "@/lib/floor-plan/types";
import { useCostDesign } from "@/contexts/account-costs/cost-defaults-context";

/**
 * 顶栏右侧第一个按钮：直接显示全屋造价，点击打开「方案与成本」侧栏。
 * 造价按延迟值计算：拖动家具时每帧都会改方案，金额晚一拍更新即可，不阻塞拖动。
 */
export function CostChip({ design, active, onClick }: {
  design: Design;
  active: boolean;
  onClick: () => void;
}) {
  const effective = useCostDesign(useDeferredValue(design));
  const total = useMemo(() => costBreakdown(effective).total, [effective]);
  return (
    <EditorTooltip label="方案与成本">
      <button
        type="button"
        className={"tool-button toolbar-chip" + (active ? " active" : "")}
        aria-label={`方案与成本，全屋约 ${yuanShort(total)}`}
        aria-pressed={active}
        onClick={onClick}
      >
        <CircleDollarSign size={16} />
        <span>{yuanShort(total)}</span>
      </button>
    </EditorTooltip>
  );
}
