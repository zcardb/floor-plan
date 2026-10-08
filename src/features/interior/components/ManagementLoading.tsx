// 首屏骨架按目标页面真实版式对齐：cards 为项目卡片网格，library 为账号家具库（页头+工具条+分类胶囊+价格卡片）。
const CARD_KEYS = [0, 1, 2];
const ITEM_KEYS = [0, 1, 2, 3, 4, 5];
const GROUPS = [[0, 1, 2], [0, 1, 2, 3, 4, 5]];

export function ManagementLoading({ heading = false, label = '加载内容', variant = 'cards' }: { heading?: boolean; label?: string; variant?: 'cards' | 'library' }) {
  if (variant === 'library') return <div className="cms-loading-placeholder" role="status" aria-label={label} aria-busy="true">
    {heading && <div className="cms-loading-heading cms-loading-heading--library" aria-hidden="true">
      <span className="cms-skeleton cms-skeleton-eyebrow" />
      <span className="cms-skeleton cms-skeleton-title" />
      <span className="cms-skeleton cms-skeleton-description" />
    </div>}
    <div className="cms-loading-panel" aria-hidden="true">
      <div className="cms-loading-toolbar">
        <span className="cms-skeleton cms-skeleton-search" />
        <span className="cms-skeleton cms-skeleton-action" />
      </div>
      {GROUPS.map((chips, group) => <div className="cms-loading-group" key={group}>
        <span className="cms-skeleton cms-skeleton-group-label" />
        <div className="cms-loading-chips">{chips.map(chip => <span className="cms-skeleton" key={chip} />)}</div>
      </div>)}
    </div>
    <div className="cms-loading-results" aria-hidden="true">
      <span className="cms-skeleton cms-skeleton-subtitle" />
      <span className="cms-skeleton cms-skeleton-note" />
    </div>
    <div className="cms-loading-block" aria-hidden="true">
      <span className="cms-skeleton cms-skeleton-block-title" />
      <div className="cms-loading-items">{ITEM_KEYS.map(key => <div className="cms-loading-item" key={key}>
        <span className="cms-skeleton cms-loading-item-visual" />
        <span className="cms-skeleton cms-skeleton-item-name" />
        <span className="cms-skeleton cms-skeleton-item-meta" />
        <span className="cms-skeleton cms-skeleton-item-price" />
      </div>)}</div>
    </div>
  </div>;
  return <div className="cms-loading-placeholder" role="status" aria-label={label} aria-busy="true">
    {heading && <div className="cms-loading-heading" aria-hidden="true"><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>}
    <div className="cms-loading-grid" aria-hidden="true">{CARD_KEYS.map(key => <div className="cms-loading-card" key={key}><span className="cms-skeleton cms-skeleton-icon" /><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>)}</div>
  </div>;
}
