import { useCallback, useLayoutEffect, useRef } from "react";
import { Armchair, CircleDollarSign, GripVertical } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { AiIcon } from "./AiIcon";
import { useEditorDrag } from "./useEditorDrag";
import type { PanelKind } from "./SidePanel";

/** 竖条与画布右边缘、顶部 / 底部留出的间距。 */
const RAIL_INSET = 16;

/**
 * 画布上的竖向工具条：「家具」「成本」（登录后）「AI 模式」三个常驻入口。
 * 默认贴画布右边缘垂直居中，顶部把手可拖动（复用 useEditorDrag，位置限制在画布内，只存内存）；
 * 窄屏由 CSS 改成画布底部横排，并取消位移，所以窄屏不做拖动。
 */
type RailKind = "library" | "cost" | "ai";
export function CanvasRail({ sidePanel, stage, showCosts = false, onToggle }: {
  /** 当前打开的侧栏种类，用于高亮。 */
  sidePanel: PanelKind | null;
  stage: React.RefObject<HTMLElement | null>;
  /** 成本只对登录用户开放。 */
  showCosts?: boolean;
  onToggle: (kind: RailKind) => void;
}) {
  const node = useRef<HTMLElement>(null);
  const { place, handlers } = useEditorDrag(node, stage, () => {});
  const position = useCallback(() => {
    const rail = node.current, host = stage.current;
    if (!rail || !host) return;
    place({
      x: Math.max(0, host.clientWidth - rail.offsetWidth - RAIL_INSET),
      y: Math.max(0, (host.clientHeight - rail.offsetHeight) / 2),
    });
  }, [place, stage]);
  // 默认位置依赖画布尺寸：画布变化时重新贴合右边缘，拖过的位置由 useEditorDrag 记住。
  useLayoutEffect(() => {
    position();
    const host = stage.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => position());
    observer.observe(host);
    return () => observer.disconnect();
  }, [position, stage]);
  const button = (kind: RailKind, label: string, children: React.ReactNode) => (
    <EditorTooltip key={kind} label={label} side="left">
      <button
        type="button"
        className={"canvas-rail-button" + (sidePanel === kind ? " active" : "")}
        aria-label={label}
        aria-pressed={sidePanel === kind}
        onClick={() => onToggle(kind)}
      >
        {children}
      </button>
    </EditorTooltip>
  );
  return (
    <aside className="canvas-rail" ref={node} aria-label="画布工具条">
      <EditorTooltip label="拖动工具条" side="left">
        <button type="button" className="canvas-rail-grip" aria-label="拖动工具条" {...handlers}>
          <GripVertical size={14} />
        </button>
      </EditorTooltip>
      {button("library", "家具", <Armchair size={20} />)}
      {showCosts && button("cost", "成本", <CircleDollarSign size={20} />)}
      {button("ai", "AI 模式", <AiIcon size={20} />)}
    </aside>
  );
}
