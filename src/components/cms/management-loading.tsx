// 首屏骨架按目标页面真实版式对齐：
// projects 为项目管理（页头含搜索+胶囊+4:3 项目卡片，无结果标题行），library 为账号家具库（页头含搜索+刷新+「全部 / 硬装 / 软装」一排胶囊+连续价格卡片网格），
// cards 为通用占位（恢复工作室）。
type Variant = 'cards' | 'projects' | 'library';
const keys = (n: number) => Array.from({ length: n }, (_, i) => i);

function Heading({ actions }: { actions: ('search' | 'icon' | 'button')[] }) {
  return <div className="cms-loading-heading cms-loading-heading--page" aria-hidden="true">
    <div className="cms-loading-heading-text">
      <span className="cms-skeleton cms-skeleton-title" />
      <span className="cms-skeleton cms-skeleton-description" />
    </div>
    <div className="cms-loading-actions">{actions.map((kind, i) => <span key={i} className={'cms-skeleton ' + (kind === 'search' ? 'cms-skeleton-search-inline' : kind === 'icon' ? 'cms-skeleton-icon-action' : 'cms-skeleton-action')} />)}</div>
  </div>;
}

/** 筛选区骨架：与 `.cms-filter-rows` 同版式，一排胶囊。 */
function FilterPanel({ chips }: { chips: number }) {
  return <div className="cms-loading-filter-rows cms-loading-filter-rows--single" aria-hidden="true">
    <div className="cms-loading-group">
      <div className="cms-loading-chips">{keys(chips).map(chip => <span className="cms-skeleton" key={chip} />)}</div>
    </div>
  </div>;
}

/** 项目卡片网格骨架：与 ProjectCard 一致，4:3 缩略图 + 单行标题。 */
export function ProjectCardsSkeleton({ count = 8 }: { count?: number }) {
  return <div className="cms-project-grid" aria-hidden="true">{keys(count).map(key => <div className="cms-loading-project" key={key}>
    <span className="cms-skeleton cms-loading-project-thumb" />
    <span className="cms-skeleton cms-skeleton-item-name" />
  </div>)}</div>;
}

/** 家具库卡片骨架：卡片连成一整片，没有分类小标题。 */
function LibraryItems() {
  return <div className="cms-loading-items cms-loading-items--flat" aria-hidden="true">{keys(8).map(key => <div className="cms-loading-item" key={key}>
    <span className="cms-skeleton cms-loading-item-visual" />
    <span className="cms-skeleton cms-skeleton-item-name" />
    <span className="cms-skeleton cms-skeleton-item-meta" />
    <span className="cms-skeleton cms-skeleton-item-price" />
  </div>)}</div>;
}

export function ManagementLoading({ heading = false, label = '加载内容', variant = 'cards' }: { heading?: boolean; label?: string; variant?: Variant }) {
  const status = { className: 'cms-loading-placeholder', role: 'status', 'aria-label': label, 'aria-busy': true } as const;
  if (variant === 'projects') return <div {...status}>
    {heading && <Heading actions={['search', 'icon', 'button']} />}
    <FilterPanel chips={3} />
    <ProjectCardsSkeleton />
  </div>;
  if (variant === 'library') return <div {...status}>
    {heading && <Heading actions={['search', 'icon', 'button']} />}
    <FilterPanel chips={3} />
    <LibraryItems />
  </div>;
  return <div {...status}>
    {heading && <div className="cms-loading-heading" aria-hidden="true"><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>}
    <div className="cms-loading-grid" aria-hidden="true">{keys(3).map(key => <div className="cms-loading-card" key={key}><span className="cms-skeleton cms-skeleton-icon" /><span className="cms-skeleton cms-skeleton-title" /><span className="cms-skeleton cms-skeleton-description" /></div>)}</div>
  </div>;
}
