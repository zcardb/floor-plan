import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VisualSelectField } from '@/components/picker/visual-select-field';
import { furnitureThumb, outlineThumb } from '@/components/material-swatch/material-thumbs';
import { typePickerItems } from '@/components/picker/furniture-picker-items';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { furnitureTypes, matchFurnitureType, type FurnitureOutline } from '@/lib/floor-plan/furniture-appearance';
import { previewFurnitureDraft, type FurnitureDraft } from '../model/furniture-draft';

/**
 * 新建 / 编辑家具共用的表单项：名称、分类、参考类型、外形、尺寸、价格、模型颜色。
 * 两处弹窗字段完全一致；分类下拉由调用方提供（新建可切到硬装表单，编辑只在软装内切换）。
 */
export function FurnitureFormFields({ draft, onChange, categoryField, priceLabel = '价格 / 元每件', priceHint, disabled: allDisabled, priceOnly = false, identityLocked = false }: {
  draft: FurnitureDraft;
  onChange: (patch: Partial<FurnitureDraft>) => void;
  categoryField: ReactNode;
  priceLabel?: string;
  priceHint?: ReactNode;
  disabled?: boolean;
  /** 内置家具：只能改单价，其余字段只读。 */
  priceOnly?: boolean;
  /** 内置家具：分类与参考类型决定家具类型和 2D 符号，改动它们等于换一款家具，因此始终只读。 */
  identityLocked?: boolean;
}) {
  const disabled = allDisabled || priceOnly;
  const identity = disabled || identityLocked;
  const typeItems = typePickerItems(furnitureTypes, furnitureTypes.find(option => option.value === matchFurnitureType(draft.name))?.label ?? '通用物件');
  const circle = draft.shape === 'circle';
  const preview = previewFurnitureDraft(draft, { w: 1800, d: 800, height: 800 });
  const outlines: { value: FurnitureOutline; label: string }[] = [{ value: 'reference', label: '参考原形' }, { value: 'rectangle', label: '方形' }, { value: 'circle', label: '圆形' }];
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
    <VisualSelectField className="custom-field" label="参考类型" id="furniture-type" value={draft.typeChoice} disabled={identity} placeholder="搜索类型或家具名称…"
      options={typeItems.map(item => ({ value: item.id, label: item.label, group: item.group, keywords: item.keywords, visual: item.id === 'auto' ? furnitureThumb({ ...preview, imageUrl: undefined }) : item.visual }))}
      onChange={typeChoice => onChange({ typeChoice })} />
    <VisualSelectField className="custom-field" label="外形" id="furniture-outline" value={draft.shape} disabled={identity} placeholder="搜索外形…"
      options={outlines.map(({ value, label }) => ({ value, label, visual: outlineThumb(value, preview) }))}
      onChange={value => onChange({ shape: value as FurnitureOutline })} />
    <div className="custom-dimensions">{dimensions.map(([label, id, key]) => <div className="custom-field" key={id}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={0.01} min={0.05} max={key === 'h' ? 8 : 20} value={draft[key]} disabled={disabled} onChange={e => onChange({ [key]: e.target.value })} />
    </div>)}</div>
    <div className="custom-field">
      <Label htmlFor="furniture-price">{priceLabel}</Label>
      <Input id="furniture-price" type="number" min={0} placeholder="未定价" value={draft.price} disabled={allDisabled} onChange={e => onChange({ price: e.target.value })} />
      {priceHint && <small className="custom-field-hint">{priceHint}</small>}
    </div>
    <div className="custom-field"><Label htmlFor="furniture-color">模型颜色</Label><ColorPicker label="模型颜色" value={draft.color} onChange={color => onChange({ color })} disabled={disabled} triggerId="furniture-color" /></div>
  </fieldset>;
}
