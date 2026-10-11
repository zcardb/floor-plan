import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Armchair, ChevronsDownUp, ChevronsUpDown, CircleDollarSign, House, Ruler } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { AiIcon } from "./AiIcon";
import { useEditorDrag } from "./useEditorDrag";
import type { PanelKind } from "./SidePanel";

/** 竖条与画布右边缘、顶部 / 底部留出的间距。 */
const RAIL_INSET = 16;
/** 整条都能拖：移动超过这个距离才算拖动，否则按普通点击处理。 */
const RAIL_DRAG_THRESHOLD = 4;

/**
 * 画布上的竖向工具条，所有侧栏入口都在这里，顺序固定：「方案总览」→「家具设计」→「成本设计」→
 * 「户型设计」→「AI 设计」，底部收起 / 展开；总览、成本、户型只对登录用户显示。
 * 默认贴画布右边缘垂直居中；整条可拖动（复用 useEditorDrag 的阈值模式，位置限制在画布内，只存内存）；
 * 收起后只剩一个圆形展开按钮。按钮默认无底色，只有打开的那一项有底色。
 * 窄屏由 CSS 改成画布底部横排，并取消位移，所以窄屏不做拖动。
 */
export function CanvasRail({ sidePanel, stage, loggedIn = false, onToggle }: {
  /** 当前打开的侧栏种类，用于高亮。 */
  sidePanel: PanelKind | null;
  stage: React.RefObject<HTMLElement | null>;
  /** 方案总览、户型设置、成本只对登录用户开放。 */
  loggedIn?: boolean;
  onToggle: (kind: PanelKind) => void;
}) {
  const node = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { place, handlers } = useEditorDrag(node, stage, () => {}, { threshold: RAIL_DRAG_THRESHOLD });
  const position = useCallback(() => {
    const rail = node.current, host = stage.current;
    if (!rail || !host) return;
    place({
      x: Math.max(0, host.clientWidth - rail.offsetWidth - RAIL_INSET),
      y: Math.max(0, (host.clientHeight - rail.offsetHeight) / 2),
    });
  }, [place, stage]);
  // 默认位置依赖画布与竖条尺寸（收起 / 展开会变高）：变化时重新贴合，拖过的位置由 useEditorDrag 记住。
  useLayoutEffect(() => {
    position();
    const host = stage.current, rail = node.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => position());
    observer.observe(host);
    if (rail) observer.observe(rail);
    return () => observer.disconnect();
  }, [position, stage]);
  const button = (kind: PanelKind, label: string, children: React.ReactNode) => (
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
  const toggleLabel = collapsed ? "展开工具条" : "收起工具条";
  return (
    // 方向键留给按钮自身的焦点导航，竖条只接指针拖动
    <aside className={"canvas-rail" + (collapsed ? " collapsed" : "")} ref={node} aria-label="画布工具条" {...handlers} onKeyDown={undefined}>
      {!collapsed && <>
        {loggedIn && button("overview", "方案总览", <House size={20} />)}
        {button("library", "家具设计", <Armchair size={20} />)}
        {loggedIn && button("cost", "成本设计", <CircleDollarSign size={20} />)}
        {loggedIn && button("settings", "户型设计", <Ruler size={20} />)}
        {button("ai", "AI 设计", <AiIcon size={20} />)}
      </>}
      <EditorTooltip label={toggleLabel} side="left">
        <button
          type="button"
          className="canvas-rail-toggle"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronsUpDown size={18} /> : <ChevronsDownUp size={18} />}
        </button>
      </EditorTooltip>
    </aside>
  );
}
