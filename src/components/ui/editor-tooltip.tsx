import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

export interface EditorTooltipProps {
  /** 动作名 */
  label: string;
  /** 可选快捷键，渲染为 kbd */
  shortcut?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  /** 子按钮处于禁用态时置为 true：禁用按钮不触发指针事件，需要外层承载提示 */
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * 编辑器统一悬浮提示：鼠标悬浮、键盘聚焦、触屏长按都会显示「动作名 + 快捷键」。
 *
 * 正常态用 asChild 直接挂在按钮上，不新增包裹层，不影响
 * `.tool-group > button`、`.visual-selection-editor > button` 等既有样式；
 * 仅禁用态加一层 span，让禁用按钮也能显示提示。
 */
export function EditorTooltip({
  label,
  shortcut,
  side = "bottom",
  disabled = false,
  children,
}: EditorTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? <span className="editor-tooltip-trigger">{children}</span> : children}
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={8} className="tool-tooltip">
          <span className="tool-tooltip-row">
            <span>{label}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
