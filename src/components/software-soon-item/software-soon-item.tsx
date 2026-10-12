import { AppWindow } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

/**
 * 第三方软件导入 / 导出入口：暂未开放，直接禁用且不展开子菜单。
 * 禁用项不响应指针事件，由 EditorTooltip 的外层包裹承接悬停并提示 Coming soon。
 */
export function SoftwareSoonItem({ label }: { label: string }) {
  return <EditorTooltip label="Coming soon" side="left" disabled>
    <DropdownMenuItem disabled className="soon-item"><AppWindow size={16} />{label}</DropdownMenuItem>
  </EditorTooltip>;
}
