// 首屏骨架按目标页面真实版式对齐：
// projects 为项目管理（页头+搜索+来源胶囊+结果标题+4:3 项目卡片），library 为账号家具库（页头+搜索+硬装/软装胶囊+分类价格卡片），
// cards 为通用占位（恢复工作室）。
type Variant = 'cards' | 'projects' | 'library';
const keys = (n: number) => Array.from({ length: n }, (_, i) => i);

function Heading({ actions }: { actions: ('icon' | 'button')[] }) {
  return <div className="cms-loading-heading cms-loading-heading--page" aria-hidden="true">
    <div className="cms-loading-heading-text">
      <span className="cms-skeleton cms-skeleton-eyebrow" />
      <span className="cms-skeleton cms-skeleton-title" />
      <span className="cms-skeleton cms-skeleton-description" />
    </div>
    <div className="cms-loading-actions">{actions.map((kind, i) => <span key={i} className={'cms-skeleton ' + (kind === 'icon' ? 'cms-skeleton-icon-action' : 'cms-skeleton-action')} />)}</div>
  </div>;
}

function FilterPanel({ groups }: { groups: number[] }) {
  return <>
    <div className="cms-loading-panel" aria-hidden="true">
      <div className="cms-loading-toolbar"><span className="cms-skeleton cms-skeleton-search" /></div>
      {groups.map((chips, group) => <div className="cms-loading-group" key={group}>
        <span className="cms-skeleton cms-skeleton-group-label" />
        <div className="cms-loading-chips">{keys(chips).map(chip => <span className="cms-skeleton" key={chip} />)}</div>
      </div>)}
    </div>
    <div className="cms-loading-results" aria-hidden="true">
      <span className="cms-skeleton cms-skeleton-subtitle" />
      <span className="cms-skeleton cms-skeleton-note" />
    </div>
  </>;
}

/** 项目卡片网格骨架：与 ProjectCard 一致，4:3 缩略图 + 单行标题。 */
export function ProjectCardsSkeleton({ count = 8 }: { count?: number }) {
  return <div className="cms-project-grid" aria-hidden="true">{keys(count).map(key => <div className="cms-loading-project" key={key}>
    <span className="cms-skeleton cms-loading-project-thumb" />
    <span className="cms-skeleton cms-skeleton-item-name" />
  </div>)}</div>;
}

function LibraryBlocks() {
  return <>{[4, 6].map((count, block) => <div className="cms-loading-block" aria-hidden="true" key={block}>
    <span className="cms-skeleton cms-skeleton-block-title" />
    <div className="cms-loading-items">{keys(count).map(key => <div className="cms-loading-item" key={key}>
      <span className="cms-skeleton cms-loading-item-visual" />
      <span className="cms-skeleton cms-skeleton-item-name" />
      <span className="cms-skeleton cms-skeleton-item-meta" />
      <span className="cms-skeleton cms-skeleton-item-price" />
    </div>)}</div>
  </div>)}</>;
}

export function ManagementLoading({ heading = false, label = '加载内容', variant = 'cards' }: { heading?: boolean; label?: string; variant?: Variant }) {
  const status = { className: 'cms-loading-placeholder', role: 'status', 'aria-label': label, 'aria-busy': true } as const;
  if (variant === 'projects') return <div {...status}>
    {heading && <Heading actions={['icon', 'button']} />}
    <FilterPanel groups={[3]} />
    <ProjectCardsSkeleton />
  </div>;
  if (variant === 'library') return <div {...status}>
    {heading && <Heading actions={['button']} />}
    <FilterPanel groups={[3, 6]} />
    <LibraryBlocks />
  </div>;
  return <div {...status}>
    {heading && <div className="cms-loading-heading" aria-hidden="true"><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>}
    <div className="cms-loading-grid" aria-hidden="true">{keys(3).map(key => <div className="cms-loading-card" key={key}><span className="cms-skeleton cms-skeleton-icon" /><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>)}</div>
  </div>;
}
