import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FurniturePicker } from './FurniturePicker';
import { typePickerItems } from './pickerItems';
import { ColorPickerField } from './ColorPickerField';
import { furnitureTypes, matchFurnitureType, type FurnitureOutline } from '../model/furnitureAppearance';
import type { FurnitureDraft } from '../model/furnitureDraft';

/**
 * 新建 / 编辑家具共用的表单项：名称、分类、参考类型、外形、尺寸、价格、模型颜色。
 * 两处弹窗字段完全一致；分类下拉由调用方提供（新建可切到硬装表单，编辑只在软装内切换）。
 */
export function FurnitureFormFields({ draft, onChange, categoryField, priceLabel = '价格 / 元每件', priceHint, disabled: allDisabled, priceOnly = false }: {
  draft: FurnitureDraft;
  onChange: (patch: Partial<FurnitureDraft>) => void;
  categoryField: ReactNode;
  priceLabel?: string;
  priceHint?: ReactNode;
  disabled?: boolean;
  /** 内置家具：只能改单价，其余字段只读。 */
  priceOnly?: boolean;
}) {
  const disabled = allDisabled || priceOnly;
  const typeItems = typePickerItems(furnitureTypes, furnitureTypes.find(option => option.value === matchFurnitureType(draft.name))?.label ?? '通用物件');
  const typeLabel = typeItems.find(item => item.id === draft.typeChoice)?.label;
  const circle = draft.shape === 'circle';
  const dimensions: [label: string, id: string, key: 'w' | 'd' | 'h'][] = [
    [circle ? '直径 m' : '宽 m', 'furniture-width', 'w'],
    ...(circle ? [] : [['深 m', 'furniture-depth', 'd'] as [string, string, 'd']]),
    ['高 m', 'furniture-height', 'h'],
  ];
  return <fieldset className="custom-furniture-fields" disabled={allDisabled}>
    <div className="custom-field">
      <Label htmlFor="furniture-name">名称</Label>
      <Input id="furniture-name" aria-label="家具名称" maxLength={100} required value={draft.name} disabled={disabled} onChange={e => onChange({ name: e.target.value })} />
    </div>
    {categoryField}
    <div className="custom-field">
      <Label htmlFor="furniture-type">参考类型</Label>
      <FurniturePicker items={typeItems} label="选择参考类型" placeholder="搜索类型或家具名称…" disabled={disabled} onPick={item => onChange({ typeChoice: item.id })}>
        <button type="button" id="furniture-type" className="picker-trigger" disabled={disabled} aria-label={`参考类型：${typeLabel ?? ''}`}><span>{typeLabel}</span><ChevronDown size={12} /></button>
      </FurniturePicker>
    </div>
    <div className="custom-field">
      <Label htmlFor="furniture-outline">外形</Label>
      <Select value={draft.shape} onValueChange={value => onChange({ shape: value as FurnitureOutline })} disabled={disabled}>
        <SelectTrigger id="furniture-outline"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="reference">参考原形</SelectItem><SelectItem value="rectangle">方形</SelectItem><SelectItem value="circle">圆形</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="custom-dimensions">{dimensions.map(([label, id, key]) => <div className="custom-field" key={id}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={0.01} min={0.05} max={key === 'h' ? 8 : 20} value={draft[key]} disabled={disabled} onChange={e => onChange({ [key]: e.target.value })} />
    </div>)}</div>
    <div className="custom-field">
      <Label htmlFor="furniture-price">{priceLabel}</Label>
      <Input id="furniture-price" type="number" min={0} placeholder="未定价" value={draft.price} disabled={allDisabled} onChange={e => onChange({ price: e.target.value })} />
      {priceHint && <small className="custom-field-hint">{priceHint}</small>}
    </div>
    <ColorPickerField label="模型颜色" value={draft.color} onChange={color => onChange({ color })} disabled={disabled} />
  </fieldset>;
}
