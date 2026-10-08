import { Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import type { ProjectSummary } from '../cloud/useProjects';

const iconAction = 'h-8 w-8 text-muted-foreground hover:text-foreground';
// 删除不可撤销，图标常驻危险色，和重命名/复制一眼区分。
const dangerIconAction = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive';

interface Props {
  row: ProjectSummary;
  disabled: boolean;
  onRename: () => void;
  onDelete: () => void;
  /** 不传则不显示复制按钮（工作台下拉只需重命名和删除）。 */
  onDuplicate?: () => void;
  duplicating?: boolean;
}

/** 项目行操作：项目管理卡片与工作台项目下拉共用同一套图标按钮。系统默认方案禁用重命名与删除。 */
export function ProjectRowActions({ row, disabled, onRename, onDelete, onDuplicate, duplicating }: Props) {
  const locked = !!row.system;
  return <>
    <EditorTooltip label={locked ? '系统默认方案不可重命名' : '重命名项目'} disabled={disabled || locked}>
      <Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'重命名' + row.name} disabled={disabled || locked} onClick={onRename}><Pencil size={16} /></Button>
    </EditorTooltip>
    {onDuplicate && <EditorTooltip label="复制项目" disabled={disabled}>
      <Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'复制' + row.name} disabled={disabled} aria-busy={duplicating} onClick={onDuplicate}>{duplicating ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />}</Button>
    </EditorTooltip>}
    <EditorTooltip label={locked ? '系统默认方案不可删除' : '删除项目'} disabled={disabled || locked}>
      <Button type="button" variant="ghost" size="icon" className={dangerIconAction} aria-label={'删除' + row.name} disabled={disabled || locked} onClick={onDelete}><Trash2 size={16} /></Button>
    </EditorTooltip>
  </>;
}
