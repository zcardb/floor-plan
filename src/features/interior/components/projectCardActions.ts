import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { CardMenuAction } from './ProjectCardMenu';
import type { ProjectSummary } from '../cloud/useProjects';

/** 我的项目「⋯」菜单：重命名、复制、删除（危险，置底）。系统默认方案只能复制。 */
export function mineCardActions(row: ProjectSummary, on: { rename: () => void; duplicate: () => void; remove: () => void }): CardMenuAction[] {
  const locked = !!row.system;
  return [
    { label: '重命名', icon: Pencil, onSelect: on.rename, disabled: locked, hint: locked ? '系统默认方案不可重命名' : undefined },
    { label: '复制', icon: Copy, onSelect: on.duplicate },
    { label: '删除', icon: Trash2, onSelect: on.remove, disabled: locked, hint: locked ? '系统默认方案不可删除' : undefined, danger: true },
  ];
}

/** 内置模板「⋯」菜单：模板只读，唯一的操作是复制成可编辑的我的项目。 */
export const templateCardActions = (copy: () => void): CardMenuAction[] => [{ label: '复制为我的项目', icon: Copy, onSelect: copy }];
