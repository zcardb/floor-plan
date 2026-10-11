import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { FurniturePicker } from './FurniturePicker';
import type { PickerItem } from './pickerItems';

export interface VisualOption {
  value: string;
  label: string;
  /** 左侧缩略图；没有时该项只有文字。 */
  visual?: ReactNode;
  /** 来源角标，例如「账号库」。 */
  badge?: string;
  /** 搜索关键词。 */
  keywords?: string[];
  /** 分组标题；任一选项带分组时列表按分组显示。 */
  group?: string;
}

/**
 * 带图下拉：与「新建家具」里的参考类型选择同一套交互（搜索 + 左侧缩略图 + 当前项打勾）。
 * 硬装材料、门窗款式、家具外形都用它，选择项左侧一定显示对应的 2D 素材。
 */
export function VisualSelectField({ label, value, options, onChange, disabled = false, id, placeholder = '搜索名称…', className = 'editor-field' }: {
  label: string;
  value: string;
  options: VisualOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** 外层字段容器的样式：画布弹层用 editor-field，弹窗表单用 custom-field。 */
  className?: string;
}) {
  const fallbackId = useId(), triggerId = id ?? fallbackId;
  const current = options.find(option => option.value === value) ?? options[0];
  const items: PickerItem[] = options.map(option => ({
    id: option.value,
    label: option.label,
    group: option.group ?? '',
    badge: option.badge,
    keywords: option.keywords,
    visual: option.visual,
  }));
  return <div className={className} onKeyDown={event => event.stopPropagation()}>
    <Label htmlFor={triggerId}>{label}</Label>
    <FurniturePicker items={items} grouped={options.some(option => option.group)} selectedId={value} placeholder={placeholder} disabled={disabled}
      onPick={item => onChange(item.id)} label={label}>
      <button type="button" id={triggerId} className="picker-trigger visual-select-trigger" disabled={disabled}
        aria-label={`${label}：${current?.label ?? ''}`}>
        <span className="visual-select-visual">{current?.visual}</span>
        <span>{current?.label}</span>
        {current?.badge && <small className="visual-select-badge">{current.badge}</small>}
        <ChevronDown size={12} />
      </button>
    </FurniturePicker>
  </div>;
}
