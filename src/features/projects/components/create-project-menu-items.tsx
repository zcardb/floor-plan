import { CopyPlus, FilePlus2, FileUp, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { AiIcon } from '@/components/ai-icon/ai-icon';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SoftwareSoonItem } from '@/components/software-soon-item/software-soon-item';

export interface CreateProjectActions {
  blank: () => void;
  /** 复刻当前项目；只有工作台下拉提供（项目管理页没有「当前项目」）。 */
  duplicate?: () => void;
  /** 仅登录后提供。 */
  ai?: () => void;
  importFile: () => void;
}

/** 新建方式：16px 图标 + 标题 + 一行说明（与墙体选项菜单同一套两行刻度）。 */
function CreateOption({ icon: Icon, title, hint, onSelect, tone }: { icon: LucideIcon | ComponentType<{ size?: number }>; title: string; hint: string; onSelect: () => void; tone?: 'ai' }) {
  return <DropdownMenuItem className="create-option" data-tone={tone} onSelect={onSelect}>
    <span className="create-option-icon" aria-hidden="true"><Icon /></span>
    <span className="create-option-text"><b>{title}</b><small>{hint}</small></span>
  </DropdownMenuItem>;
}

/** 「新建项目」菜单的选项：项目管理页下拉与工作台项目下拉的子菜单共用。 */
export function CreateProjectMenuItems({ actions }: { actions: CreateProjectActions }) {
  return <>
    <CreateOption icon={FilePlus2} title="手动创建" hint="从空白户型或模板开始" onSelect={actions.blank} />
    {actions.duplicate && <CreateOption icon={CopyPlus} title="复刻当前项目" hint="复制户型、家具与报价" onSelect={actions.duplicate} />}
    {actions.ai && <CreateOption icon={AiIcon} title="AI 创建…" hint="描述需求，自动生成户型" tone="ai" onSelect={actions.ai} />}
    <DropdownMenuSeparator />
    <CreateOption icon={FileUp} title="导入 DXF 图纸…" hint="识别墙体、门窗与房间" onSelect={actions.importFile} />
    <SoftwareSoonItem label="从其他软件导入" />
  </>;
}
