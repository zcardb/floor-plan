import type { LucideIcon } from 'lucide-react';
import { CmsFilterBar } from './CmsFilterBar';

type Chip = { id: string; label: string; meta?: string };

/**
 * 管理端一行分类筛选：左侧分类描述（图标 + 名称 + 数量），右侧可横向滚动的胶囊。
 * 项目管理只有「来源」一行；家具管理的硬装 / 软装各占一行。多行时放进 `.cms-filter-rows`。
 */
export function CmsFilterGroup({ icon: Icon, label, count, ariaLabel, chips, value, onChange }: {
  icon: LucideIcon; label: string; count: string | number; ariaLabel: string; chips: Chip[]; value: string; onChange: (id: string) => void;
}) {
  return <div className="cms-filter-group">
    <div className="cms-filter-group-label"><Icon size={15} /><span>{label}</span><small>{count} 项</small></div>
    <CmsFilterBar label={ariaLabel} chips={chips} value={value} onChange={onChange} />
  </div>;
}
