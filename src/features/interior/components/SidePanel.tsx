import type { ReactNode } from "react";
import { X } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";

/** 编辑器右侧统一侧栏的内容种类：同一时间只开一个。 */
export type PanelKind = "library" | "ai" | "settings" | "overview" | "cost";

/**
 * 编辑器右侧统一侧栏：标题 + 关闭 + 可滚动内容区。
 * 家具库、AI 模式、户型设置、方案总览、成本共用同一个外壳，宽 340px；
 * 窄屏（≤1100px）由 CSS 转成右侧抽屉，遮罩复用 `.drawer-backdrop`。
 */
export function SidePanel({ title, readOnly = false, onClose, children }: {
  title: string;
  /** 只读预览时内容整体禁用，与原来的属性面板一致。 */
  readOnly?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="side-panel drawer-open">
      <header className="side-panel-head">
        <h2>{title}</h2>
        <EditorTooltip label="关闭侧栏">
          <button type="button" className="side-panel-close" aria-label="关闭侧栏" onClick={onClose}>
            <X size={16} />
          </button>
        </EditorTooltip>
      </header>
      <div className="panel-scroll">
        <fieldset className="contents" disabled={readOnly}>{children}</fieldset>
      </div>
    </aside>
  );
}
