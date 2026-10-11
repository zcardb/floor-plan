import type { ReactNode } from 'react';
import { CmsFilterBar } from './CmsFilterBar';

type Chip = { id: string; label: string; meta?: string };

/**
 * 管理端一行分类筛选：左侧可选的切换器（`lead`，如家具管理的硬装 / 软装下拉），右侧可横向滚动的胶囊。
 * 项目管理不传 `lead`，胶囊占满整行。
 */
export function CmsFilterGroup({ lead, ariaLabel, chips, value, onChange }: {
  lead?: ReactNode; ariaLabel: string; chips: Chip[]; value: string; onChange: (id: string) => void;
}) {
  return <div className={'cms-filter-group' + (lead ? '' : ' cms-filter-group--bare')}>
    {lead}
    <CmsFilterBar label={ariaLabel} chips={chips} value={value} onChange={onChange} />
  </div>;
}
