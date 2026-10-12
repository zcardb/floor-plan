import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Ruler } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { cn } from "@/lib/utils";
import { useEditorDrag } from "./useEditorDrag";
import type { PanelKind } from "./SidePanel";

/** 竖条与画布左边缘留出的间距。 */
const RAIL_INSET = 20;
/** 整条都能拖：移动超过这个距离才算拖动，否则按普通点击处理。 */
const RAIL_DRAG_THRESHOLD = 4;

type RailButtonProps = Omit<React.ComponentProps<"button">, "title"> & {
  icon: React.ReactNode;
  /** 图标下方的短名，最多两个字。 */
  label: string;
  /** 完整名称：比短名多出信息时才给，作为悬停提示与无障碍名称。 */
  title?: string;
  /** 当前工具：整条竖条里只有它用主色强调。 */
  active?: boolean;
  /** 对应的侧栏已打开：用中性浅底，和「当前工具」区分开。 */
  open?: boolean;
  /** 带二级菜单：图标右下角画小三角；由 DropdownMenuTrigger asChild 包裹，菜单的开合属性透传到按钮上。 */
  menu?: boolean;
  /** 图标右上角的小圆点：菜单里有开关处于开启状态。 */
  badge?: boolean;
};

/** 竖条里的一个按钮：图标在上、短名在下。 */
export function RailButton({ icon, label, title, active, open, menu, badge, className, ...rest }: RailButtonProps) {
  const button = (
    <button
      type="button"
      {...rest}
      className={cn("canvas-rail-button", menu && "has-menu", active && "active", open && "is-open", className)}
      aria-label={title ?? label}
      aria-pressed={menu ? undefined : !!(active || open)}
    >
      <span className="canvas-rail-icon">
        {icon}
        {badge && <i className="canvas-rail-badge" />}
      </span>
      <span className="canvas-rail-label" aria-hidden="true">{label}</span>
    </button>
  );
  return title ? <EditorTooltip label={title} side="right">{button}</EditorTooltip> : button;
}

/**
 * 画布左侧的竖向工具条，分两组：上面是当前模式的工具，下面是打开侧栏的入口，最后是收起。
 *
 * 竖条本身不认识具体的编辑器状态：2D 工具（选择 / 墙体 / 门 / 窗）与 3D 工具（选择 / 漫游 / 视图）
 * 由 `Workbench` 通过 `tools` 传入，3D 的「风格」通过 `panels` 排在「户型」前面（见 RailTools.tsx）。
 * 模式切换只换这两段的内容，「户型」与「收起」在两种模式下位置不变。
 *
 * 默认贴画布左边缘、垂直居中，整条可拖动（复用 useEditorDrag 的阈值模式，位置限制在画布内，只存内存）；
 * 收起后只剩「展开」按钮。窄屏由 CSS 改成画布底部横排、只显示图标并取消位移，所以窄屏不做拖动。
 */
export function CanvasRail({ sidePanel, stage, onToggle, tools, panels }: {
  /** 当前打开的侧栏种类，用于高亮。 */
  sidePanel: PanelKind | null;
  stage: React.RefObject<HTMLElement | null>;
  onToggle: (kind: PanelKind) => void;
  /** 当前模式的工具，2D / 3D 各一套，由 Workbench 给出。 */
  tools: React.ReactNode;
  /** 当前模式专属的侧栏入口，排在「户型」前面。 */
  panels?: React.ReactNode;
}) {
  const node = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { place, handlers } = useEditorDrag(node, stage, () => {}, { threshold: RAIL_DRAG_THRESHOLD });
  const position = useCallback(() => {
    const rail = node.current, host = stage.current;
    if (!rail || !host) return;
    place({ x: RAIL_INSET, y: Math.max(RAIL_INSET, (host.clientHeight - rail.offsetHeight) / 2) });
  }, [place, stage]);
  // 默认位置依赖画布与竖条尺寸（模式切换、收起 / 展开都会变高）：变化时重新居中，拖过的位置由 useEditorDrag 记住。
  useLayoutEffect(() => {
    position();
    const host = stage.current, rail = node.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => position());
    observer.observe(host);
    if (rail) observer.observe(rail);
    return () => observer.disconnect();
  }, [position, stage]);
  return (
    // 方向键留给按钮自身的焦点导航，竖条只接指针拖动
    <aside className={"canvas-rail" + (collapsed ? " collapsed" : "")} ref={node} aria-label="画布工具条" {...handlers} onKeyDown={undefined}>
      {!collapsed && <>
        <div className="canvas-rail-group">{tools}</div>
        <div className="canvas-rail-group">
          {panels}
          <RailButton icon={<Ruler />} label="户型" title="户型设置" open={sidePanel === "settings"} onClick={() => onToggle("settings")} />
        </div>
      </>}
      <button
        type="button"
        className="canvas-rail-toggle"
        aria-label={collapsed ? "展开工具条" : "收起工具条"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        <span className="canvas-rail-label" aria-hidden="true">{collapsed ? "展开" : "收起"}</span>
      </button>
    </aside>
  );
}
