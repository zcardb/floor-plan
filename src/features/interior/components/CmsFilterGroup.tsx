import { CmsFilterBar, type Chip } from './CmsFilterBar';

/** 管理端一行分类筛选：胶囊从行首平铺、占满整行，放不下时横向滚动。 */
export function CmsFilterGroup({ ariaLabel, chips, value, onChange }: {
  ariaLabel: string; chips: Chip[]; value: string; onChange: (id: string) => void;
}) {
  return <div className="cms-filter-group">
    <CmsFilterBar label={ariaLabel} chips={chips} value={value} onChange={onChange} />
  </div>;
}
