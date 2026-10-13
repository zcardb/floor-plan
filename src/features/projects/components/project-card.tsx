import type { ReactNode } from 'react';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { ProjectCardMenu, type CardMenuAction } from './project-card-menu';

interface Props {
  title: string;
  /** 缩略图左上角的小标签（如「内置」）。 */
  badge?: string;
  /** 平面缩略图；为空时显示占位。 */
  thumbnail: ReactNode;
  /** 当前卡片正在处理（打开、复制、删除），在缩略图上显示遮罩和文字。 */
  busyLabel?: string;
  /** 其它卡片正在处理：本卡暂不可操作。 */
  locked: boolean;
  openLabel: string;
  onOpen: () => void;
  actions: CardMenuAction[];
}

/** 项目管理统一卡片：内置模板与我的项目同一外壳，上面是缩略图，下面是标题行，「⋯」与标题对齐。 */
export function ProjectCard({ title, badge, thumbnail, busyLabel, locked, openLabel, onOpen, actions }: Props) {
  const busy = !!busyLabel, disabled = locked || busy;
  return <article className={'project-card' + (busy ? ' is-busy' : '')} aria-busy={busy}>
    <button type="button" className="project-card-preview" aria-label={openLabel + ' ' + title} disabled={disabled} onClick={onOpen}>
      {thumbnail ?? <span className="project-card-placeholder"><LayoutTemplate size={24} /></span>}
      {badge && <span className="cms-item-badge">{badge}</span>}
      {busy && <span className="project-card-busy"><Loader2 className="animate-spin" size={22} />{busyLabel}</span>}
    </button>
    <div className="project-card-footer">
      <EditorTooltip label={title} disabled={disabled}>
        <button type="button" className="project-card-title" disabled={disabled} onClick={onOpen} tabIndex={-1}>{title}</button>
      </EditorTooltip>
      <ProjectCardMenu title={title} actions={actions} disabled={disabled} />
    </div>
  </article>;
}
