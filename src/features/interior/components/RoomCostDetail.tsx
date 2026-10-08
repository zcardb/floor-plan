import { useContext } from "react";
import { Armchair, ArrowLeft, Hammer } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import type { CostPart, RoomCost } from "../model/costBreakdown";
import { setPrice } from "../model/costs";
import { yuan } from "../model/money";
import type { Design } from "../model/types";
import { CostDefaultsContext } from "./CostDefaultsContext";
import { CostHero } from "./CostHero";
import { PriceInput } from "./PriceInput";

/** 同款/同材质的房间内碎片合并成一行，便于改价。 */
function mergeParts(parts: CostPart[]): CostPart[] {
  const merged = new Map<string, CostPart>();
  for (const p of parts) {
    const id = p.group + p.key,
      old = merged.get(id);
    if (!old) {
      merged.set(id, { ...p });
      continue;
    }
    old.quantity = Math.round((old.quantity + p.quantity) * 100) / 100;
    old.subtotal = Math.round((old.subtotal + p.subtotal) * 100) / 100;
  }
  return [...merged.values()];
}
/** 房间口径：本间硬装分项与房内家具，可直接改单价。 */
export function RoomCostDetail({
  design,
  room,
  wholeTotal,
  highlightedFurniture,
  change,
  back,
}: {
  design: Design;
  room: RoomCost;
  wholeTotal: number;
  /** 选中家具的同款 key，用于高亮对应行。 */
  highlightedFurniture?: string;
  change: (fn: (d: Design) => Design) => void;
  back: () => void;
}) {
  const defaults = useContext(CostDefaultsContext);
  const target = design.rooms.find((r) => r.id === room.roomId),
    hard = mergeParts(room.hard),
    soft = mergeParts(room.soft),
    share = wholeTotal > 0 ? Math.round((room.total / wholeTotal) * 100) : 0;
  const apply = (part: CostPart, value: number | null) =>
    change((d) =>
      part.group === "labor"
        ? d
        : setPrice(d, part.group, part.key, value, defaults),
    );
  return (
    <>
      <div className="panel-heading">
        <EditorTooltip label="返回全屋成本" description="回到全屋所有房间的费用汇总">
          <button className="back-link" onClick={back}>
            <ArrowLeft size={13} />
            全屋成本
          </button>
        </EditorTooltip>
        <span className="mini-label">房间口径</span>
      </div>
      <section>
        <CostHero
          eyebrow={target?.name || "房间"}
          amount={room.total}
          hard={room.hardTotal}
          soft={room.softTotal}
          softUnpriced={soft.filter((p) => p.price === null).length}
          share={share}
        />
        <p className="footnote">
          地面按面积占比分摊，共墙上的门窗在相邻房间之间平分；拆改、新建与人工属于全屋公共项，不计入本间。
        </p>
      </section>
      <section>
        <h3 className="section-title">
          <Hammer size={14} />
          硬装 <span>{yuan(room.hardTotal)}</span>
        </h3>
        {hard.map((part) => (
          <div className="cost-detail" key={part.group + part.key}>
            <div className="cost-detail-heading">
              <b>{part.label}</b>
              {part.price === null ? (
                <span className="cost-unpriced-tag">未定价</span>
              ) : (
                <span>{yuan(part.subtotal)}</span>
              )}
            </div>
            <small>
              {part.quantity.toFixed(part.unit === "件" ? 0 : 2)} {part.unit}
              {part.note ? " · " + part.note : ""}
            </small>
            <PriceInput
              key={part.group + part.key + String(part.price)}
              value={part.price}
              label={part.label + "单价"}
              onApply={(v) => apply(part, v)}
            />
          </div>
        ))}
        {!hard.length && (
          <p className="muted-note">
            本间暂无计入的硬装项目：标记为不计面积的房间不算墙面费用。
          </p>
        )}
      </section>
      <section>
        <h3 className="section-title">
          <Armchair size={14} />
          房内家具 <small>{soft.reduce((s, p) => s + p.quantity, 0)} 件</small>
        </h3>
        {soft.map((part) => (
          <div
            className={
              "cost-detail" + (part.key === highlightedFurniture ? " is-highlight" : "")
            }
            key={part.group + part.key}
          >
            <div className="cost-detail-heading">
              <b>{part.label}</b>
              {part.price === null ? (
                <span className="cost-unpriced-tag">未定价</span>
              ) : (
                <span>{yuan(part.subtotal)}</span>
              )}
            </div>
            <small>
              {part.quantity} 件 · 同款联动 · 元/件
            </small>
            <PriceInput
              key={part.group + part.key + String(part.price)}
              value={part.price}
              label={part.label + "单价"}
              onApply={(v) => apply(part, v)}
            />
          </div>
        ))}
        {!soft.length && (
          <p className="muted-note">本间还没有家具；从左侧家具库添加后会实时计入成本。</p>
        )}
      </section>
    </>
  );
}
