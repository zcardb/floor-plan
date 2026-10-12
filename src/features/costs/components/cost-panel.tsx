import { useMemo, useState } from "react";
import { calculateCosts, furnitureKey } from "@/lib/floor-plan/costs";
import { costBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { inRoom } from "@/lib/floor-plan/geometry";
import { yuan } from "@/lib/floor-plan/money";
import type { Design, Selection } from "@/lib/floor-plan/types";
import { useCostDesign } from "@/contexts/account-costs/cost-defaults-context";
import { CostCategoryList } from "./cost-category-list";
import { CostPricing } from "./cost-pricing";
import { CostSummary } from "./cost-summary";
import { PlanMetrics } from "./plan-metrics";
import { RoomCostDetail } from "./room-cost-detail";
import { RoomCostList } from "./room-cost-list";
import { ShortcutList } from "@/components/panel/panel-hint";

/**
 * 成本页，同时承担原来的「方案总览」：口径跟随选中对象——选中房间（或房内家具）时看本间，否则看全屋。
 * 全屋口径自上而下是「方案指标 → 合计 → 按房间 → 明细 → 计算口径」：
 * 先说这个家多大，再给一个金额结果，然后展开细节，最后才是计算规则说明。
 */
export function CostPanel({
  design,
  selection,
  change,
  back,
  select,
}: {
  design: Design;
  selection: Selection;
  change: (fn: (d: Design) => Design) => void;
  back: () => void;
  select: (s: Selection) => void;
}) {
  const effective = useCostDesign(design),
    c = useMemo(() => calculateCosts(effective), [effective]),
    b = useMemo(() => costBreakdown(effective), [effective]),
    [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const furniture = selection?.kind === "furniture"
      ? effective.furniture.find((f) => f.id === selection.id)
      : undefined,
    roomId =
      selection?.kind === "room"
        ? selection.id
        : furniture
          ? effective.rooms.find((r) => inRoom([furniture.cx, furniture.cy], r))?.id
          : undefined,
    room = b.rooms.find((r) => r.roomId === roomId);
  if (room)
    return (
      <RoomCostDetail
        design={design}
        room={room}
        wholeTotal={b.total}
        highlightedFurniture={furniture ? furnitureKey(furniture) : undefined}
        change={change}
        back={back}
      />
    );
  const drift = Math.abs(b.roomTotal + b.sharedTotal - b.total);
  return (
    <>
      <section>
        <PlanMetrics design={design} />
      </section>
      <section>
        {/* 合计：一个焦点数字 + 硬装 / 软装 */}
        <CostSummary
          amount={b.total}
          hard={b.hardTotal}
          soft={b.softTotal}
          softUnpriced={c.soft.filter((r) => r.price === null).length}
        />
        {/* 定价：进度 + 未定价提示 + 只看未定价 */}
        <CostPricing
          priced={b.pricedCount}
          total={b.priceableCount}
          unpricedGroups={b.unpriced}
          onlyUnpriced={onlyUnpriced}
          onToggleUnpriced={() => setOnlyUnpriced((v) => !v)}
        />
        {drift > 1 && (
          <p className="cost-warning" role="alert">
            房间分摊与总额存在 {yuan(drift)} 的取整差额。
          </p>
        )}
      </section>
      <section>
        <h3 className="section-title">
          明细 <small>点击类别展开</small>
        </h3>
        <CostCategoryList
          design={design}
          rows={[...c.hard, ...c.soft]}
          labor={c.labor}
          onlyUnpriced={onlyUnpriced}
          change={change}
        />
      </section>
      <section>
        <h3 className="section-title">
          按房间 <small>点击查看本间</small>
        </h3>
        <RoomCostList design={effective} breakdown={b} select={select} />
        <div className="room-cost-total">
          <span>各房间合计</span>
          <b>{yuan(b.roomTotal)}</b>
          <span>+ 公共项</span>
          <b>{yuan(b.sharedTotal)}</b>
        </div>
      </section>
      <section>
        <h3 className="section-title">计算口径</h3>
        <p className="footnote">地面含损耗与采购取整；墙面扣除对应门窗；门窗按相邻房间平分；拆改、新建与人工为全屋公共项，不计入单个房间。</p>
      </section>
      <section>
        <h3 className="section-title">快捷键</h3>
        <ShortcutList />
      </section>
    </>
  );
}
