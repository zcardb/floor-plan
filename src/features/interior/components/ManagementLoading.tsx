export function ManagementLoading({ heading = false, label = '加载内容' }: { heading?: boolean; label?: string }) {
  return <div className="cms-loading-placeholder" role="status" aria-label={label} aria-busy="true">
    {heading && <div className="cms-loading-heading" aria-hidden="true"><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>}
    <div className="cms-loading-grid" aria-hidden="true">{[0, 1, 2].map(key => <div className="cms-loading-card" key={key}><span className="cms-skeleton cms-skeleton-icon" /><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>)}</div>
  </div>;
}
