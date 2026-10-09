import { CopyPlus, FilePlus2, FileUp, Sparkles } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SoftwareSoonItem } from './SoftwareSoonItem';

export interface CreateProjectActions {
  blank: () => void;
  /** 复刻当前项目；只有工作台下拉提供（项目管理页没有「当前项目」）。 */
  duplicate?: () => void;
  /** 仅登录后提供。 */
  ai?: () => void;
  importFile: () => void;
}

/** 「新建项目」菜单的选项：项目管理页下拉与工作台项目下拉的子菜单共用。 */
export function CreateProjectMenuItems({ actions }: { actions: CreateProjectActions }) {
  return <>
    <DropdownMenuItem onSelect={actions.blank}><FilePlus2 />手动创建</DropdownMenuItem>
    {actions.duplicate && <DropdownMenuItem onSelect={actions.duplicate}><CopyPlus />复刻当前项目</DropdownMenuItem>}
    {actions.ai && <DropdownMenuItem onSelect={actions.ai}><Sparkles />AI 创建…</DropdownMenuItem>}
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={actions.importFile}><FileUp />导入 DXF 图纸…</DropdownMenuItem>
    <SoftwareSoonItem label="从其他软件导入" />
  </>;
}
