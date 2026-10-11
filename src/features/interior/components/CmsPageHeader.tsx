import type { ReactNode } from 'react';

/**
 * 管理端统一页头：左侧标题、说明；右侧同一行放搜索框与页面操作（刷新 / 同步状态 / 主操作）。
 * 分类筛选另起一行放在页头下方（`.cms-filter-rows`）。
 */
export function CmsPageHeader({ title, description, search, actions }: { title: string; description: string; search?: ReactNode; actions?: ReactNode }) {
  return <header className="cms-heading cms-page-header">
    <div className="cms-page-header-text">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {(search || actions) && <div className="cms-heading-actions">{search}{actions}</div>}
  </header>;
}
