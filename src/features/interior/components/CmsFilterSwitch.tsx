import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Option = { id: string; label: string; count: number };

/** 筛选行左侧的大类切换下拉（如硬装 / 软装）：触发器显示当前大类与数量，切换后右侧胶囊联动。 */
export function CmsFilterSwitch({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (id: string) => void }) {
  const current = options.find(option => option.id === value) ?? options[0];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="cms-filter-switch" aria-label={`${label}：${current.label}`}>
        <span>{current.label}</span><small>{current.count}</small><ChevronDown size={14} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="cms-filter-switch-menu">
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map(option => <DropdownMenuRadioItem key={option.id} value={option.id}>
          {option.label}<small>{option.count} 项</small>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
