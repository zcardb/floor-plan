import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { BACK_REQUIRED_TYPES, SPAN_LABEL, backingOf, roomLayout } from "../model/layoutRules";
import { inRoom } from "../model/geometry";
import type { Design, Furniture } from "../model/types";

/**
 * 手动摆放的背靠面提示：柜类、电视、冰箱、空调等被拖到没有实墙的一侧
 * （通向阳台的开间、垭口、矮墙栏板、大片玻璃）时给一条提示，不阻断编辑。
 */
export function BackingNote({ design, furniture }: { design: Design; furniture: Furniture }) {
  const warn = useMemo(() => {
    if (!BACK_REQUIRED_TYPES.has(furniture.type)) return null;
    const room = design.rooms.find((r) => inRoom([furniture.cx, furniture.cy], r));
    if (!room) return null;
    const layout = roomLayout(design, room);
    if (!layout.edges.length) return null;
    const { ratio, other } = backingOf(layout.edges, furniture);
    if (ratio >= 0.7) return null;
    return `背面后方是${SPAN_LABEL[other]}，这一侧没有实墙，无法靠墙安装。请转到有实墙的一侧，或沿墙挪到有墙的位置。`;
  }, [design, furniture]);
  if (!warn) return null;
  return <p className="backing-note" role="note"><TriangleAlert size={14} />{warn}</p>;
}
