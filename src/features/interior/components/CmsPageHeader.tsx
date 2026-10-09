import type { ReactNode } from 'react';

/** 管理端统一页头：左侧小标题、标题、说明；右侧主操作，两页位置一致。 */
export function CmsPageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="cms-heading cms-page-header">
    <div className="cms-page-header-text">
      <span className="cms-page-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions && <div className="cms-heading-actions">{actions}</div>}
  </header>;
}
