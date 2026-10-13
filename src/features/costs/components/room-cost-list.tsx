import { ChevronRight } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import type { CostBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { floorMaterialOf } from "@/lib/floor-plan/floor-materials";
import { area } from "@/lib/floor-plan/geometry";
import { yuan } from "@/lib/floor-plan/money";
import type { Design, Selection } from "@/lib/floor-plan/types";

/** 全屋口径：各房间的面积、金额与占比，点击进入房间口径。 */
export function RoomCostList({
  design,
  breakdown,
  select,
}: {
  design: Design;
  breakdown: CostBreakdown;
  select: (s: Selection) => void;
}) {
  const max = Math.max(
    1,
    ...breakdown.rooms.map((r) => r.total),
    breakdown.sharedTotal,
  );
  const bar = (n: number) => ({ width: Math.max(2, (n / max) * 100) + "%" });
  return (
    <div className="room-cost-list">
      {breakdown.rooms.map((rc) => {
        const room = design.rooms.find((r) => r.id === rc.roomId);
        if (!room) return null;
        return (
          <EditorTooltip key={rc.roomId} label={room.name}>
            <button
              className="room-cost-row"
              onClick={() => select({ kind: "room", id: rc.roomId })}
            >
              <span className="room-cost-name">
                <i style={{ background: floorMaterialOf(design, room.mat).color }} />
                <span className="room-cost-name-text">
                  {room.name}
                  {room.counted === false ? " *" : ""}
                </span>
                <em>{area(room).toFixed(2)} m²</em>
              </span>
              <span className="room-cost-bar">
                <i style={bar(rc.total)} />
              </span>
              <b>{yuan(rc.total)}</b>
              <ChevronRight size={13} />
            </button>
          </EditorTooltip>
        );
      })}
      <div className="room-cost-row is-shared">
      <span className="room-cost-name">全屋公共项</span>
      <span className="room-cost-bar" />
      <b>{yuan(breakdown.sharedTotal)}</b>
      <span />
      </div>
    </div>
  );
}
