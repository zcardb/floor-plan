import type { ReactNode } from "react";

/** 编辑器右侧统一侧栏的内容种类：同一时间只开一个。 */
export type PanelKind = "library" | "ai" | "settings" | "overview" | "cost";

/**
 * 编辑器右侧统一侧栏：只有可滚动内容区，不再有标题行和关闭按钮——
 * 当前是哪个面板由画布竖条的高亮表达，再点一次竖条上的同一项即可收起；
 * 窄屏（≤1100px）由 CSS 转成右侧抽屉，点遮罩 `.drawer-backdrop` 关闭。
 * 家具库、AI、户型、方案总览、成本共用同一个外壳，宽 340px。
 */
export function SidePanel({ title, readOnly = false, children }: {
  /** 无障碍名称（不显示）。 */
  title: string;
  /** 只读预览时内容整体禁用，与原来的属性面板一致。 */
  readOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <aside className="side-panel drawer-open" aria-label={title}>
      <div className="panel-scroll">
        <fieldset className="contents" disabled={readOnly}>{children}</fieldset>
      </div>
    </aside>
  );
}
