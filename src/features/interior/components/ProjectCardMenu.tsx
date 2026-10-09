import { Fragment } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface CardMenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** 禁用原因，显示在菜单项下方。 */
  hint?: string;
  /** 危险操作：分隔线隔开、放在最后、用危险色。 */
  danger?: boolean;
}

/** 卡片标题行右侧的「⋯」菜单：次要操作收进菜单，删除与其它操作分开。 */
export function ProjectCardMenu({ title, actions, disabled }: { title: string; actions: CardMenuAction[]; disabled: boolean }) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="project-card-menu" aria-label={title + ' 的更多操作'} disabled={disabled}>
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="project-card-menu-content">
      {actions.map(({ label, icon: Icon, onSelect, disabled: off, hint, danger }) => <Fragment key={label}>
        {danger && <DropdownMenuSeparator />}
        <DropdownMenuItem disabled={off} onSelect={onSelect} className={danger ? 'project-card-menu-danger' : undefined}>
          <Icon />
          <span className="project-card-menu-label">{label}{hint && <small>{hint}</small>}</span>
        </DropdownMenuItem>
      </Fragment>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
