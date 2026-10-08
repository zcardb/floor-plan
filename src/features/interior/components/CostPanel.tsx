import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { calculateCosts, furnitureKey } from "../model/costs";
import { costBreakdown } from "../model/costBreakdown";
import { inRoom } from "../model/geometry";
import { yuan } from "../model/money";
import type { Design, Selection } from "../model/types";
import { useCostDesign } from "./CostDefaultsContext";
import { CostCategoryList } from "./CostCategoryList";
import { CostHero } from "./CostHero";
import { RoomCostDetail } from "./RoomCostDetail";
import { RoomCostList } from "./RoomCostList";

/**
 * 成本页：口径跟随选中对象——选中房间（或房内家具）时看本间，
 * 否则看全屋。
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
        design={effective}
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
      <div className="panel-heading">
        <span>
          <Wallet size={15} />
          全屋成本
        </span>
        <span className="mini-label">{b.rooms.length} 个空间</span>
      </div>
      <section>
        <CostHero
          eyebrow="全屋硬装 · 已录入费用"
          amount={b.hardTotal}
          hard={b.hardTotal}
          soft={b.softTotal}
          softUnpriced={c.soft.filter((r) => r.price === null).length}
          priced={b.pricedCount}
          total={b.priceableCount}
          onlyUnpriced={onlyUnpriced}
          onToggleUnpriced={() => setOnlyUnpriced((v) => !v)}
        />
        <div className="cost-total-line">
          <span>硬装 + 软装合计</span>
          <b>{yuan(b.total)}</b>
        </div>
        {b.unpriced > 0 && (
          <p className="cost-warning">
            {b.unpriced} 类项目未定价，当前合计不是完整报价。
          </p>
        )}
        {drift > 1 && (
          <p className="cost-warning" role="alert">
            房间分摊与总额存在 {yuan(drift)} 的取整差额。
          </p>
        )}
        <p className="footnote">
          地面含损耗与采购取整；墙面扣除对应门窗；门窗按相邻房间平分；拆改、新建与人工为全屋公共项。
        </p>
      </section>
      <section>
        <h3 className="section-title">
          费用明细 <small>点击类别展开</small>
        </h3>
        <CostCategoryList
          design={effective}
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
    </>
  );
}
