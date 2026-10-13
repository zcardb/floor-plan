import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { uid, type CustomFloor, type FloorPattern } from '@/lib/floor-plan/types';
import { customFloorMaterial, floorPatterns, validCustomFloor } from '@/lib/floor-plan/floor-materials';
import { meterDraft, parseMeterDraft } from '@/lib/floor-plan/length-units';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { FloorSwatch } from '@/components/material-swatch/floor-swatch';
import { notify } from '@/lib/notify';
import { parsePriceDraft, priceDraft, type MaterialFormEdit } from '../model/material-form-edit';

type Props = { categoryField: ReactNode; accountOnly: boolean; onCancel: () => void; onSave: (floor: CustomFloor, account: boolean) => Promise<void> } & MaterialFormEdit<CustomFloor>;

export function CustomFloorForm({ categoryField, accountOnly, onCancel, onSave, initial, priceOnly = false, submitLabel, priceLabel = '单价 / 元每 m²', priceHint, extra }: Props) {
  const [name, setName] = useState(initial?.name ?? ''), [pattern, setPattern] = useState<FloorPattern>(initial?.pattern ?? 'tile'),
    [length, setLength] = useState(initial?.length ? meterDraft(initial.length) : '0.8'), [width, setWidth] = useState(initial?.width ? meterDraft(initial.width) : '0.8'),
    [color, setColor] = useState(initial?.color ?? '#e6dfd3'), [price, setPrice] = useState(priceDraft(initial?.price)), [account, setAccount] = useState(accountOnly), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [key] = useState(() => initial?.key ?? 'custom-' + uid());
  const seamless = pattern === 'seamless', locked = saving || priceOnly;
  const floor = (): CustomFloor => ({
    key, name: name.trim(), pattern, color, price: parsePriceDraft(price),
    ...(seamless ? {} : { length: parseMeterDraft(length), width: parseMeterDraft(width) }),
  });
  const preview = customFloorMaterial({ ...floor(), length: parseMeterDraft(length) || 800, width: parseMeterDraft(width) || 800 });
  const submit = async () => {
    const item = floor();
    if (!validCustomFloor(item)) { const message = seamless ? '请填写名称及非负单价' : '请填写名称、0.05～20 m 的单块尺寸及非负单价'; setError(message); notify.fail(message); return; }
    setSaving(true); setError('');
    try { await onSave(item, account || accountOnly); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); notify.error('地面「' + item.name + '」保存失败', e); }
    finally { setSaving(false); }
  };
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={saving}>
        <div className="custom-field"><Label htmlFor="floor-name">名称</Label><Input id="floor-name" aria-label="地面名称" maxLength={100} required disabled={locked} value={name} onChange={e => setName(e.target.value)} /></div>
        {categoryField}
        <div className="custom-field"><Label htmlFor="floor-pattern">铺贴样式</Label><Select value={pattern} disabled={locked} onValueChange={value => setPattern(value as FloorPattern)}><SelectTrigger id="floor-pattern"><SelectValue /></SelectTrigger><SelectContent>{floorPatterns.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        {!seamless && <div className="custom-dimensions">
          <div className="custom-field"><Label htmlFor="floor-length">{pattern === 'plank' ? '板长 m' : '砖长 m'}</Label><Input id="floor-length" type="number" step={0.01} min={0.05} max={20} disabled={locked} value={length} onChange={e => setLength(e.target.value)} /></div>
          <div className="custom-field"><Label htmlFor="floor-width">{pattern === 'plank' ? '板宽 m' : '砖宽 m'}</Label><Input id="floor-width" type="number" step={0.01} min={0.05} max={20} disabled={locked} value={width} onChange={e => setWidth(e.target.value)} /></div>
        </div>}
        <div className="custom-field"><Label htmlFor="floor-price">{priceLabel}</Label><Input id="floor-price" type="number" min={0} placeholder="未定价" value={price} onChange={e => setPrice(e.target.value)} />{priceHint && <small className="custom-field-hint">{priceHint}</small>}</div>
        <div className="custom-field"><Label htmlFor="floor-color">地面颜色</Label><ColorPicker label="地面颜色" value={color} onChange={setColor} disabled={locked} triggerId="floor-color" /></div>
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview custom-floor-preview"><FloorSwatch material={preview} /><span>{floorPatterns.find(p => p.value === pattern)?.label} · 平面图预览</span></div>
        <small>地面按参数绘制纹理，不生成图片、不消耗 AI 额度。{initial ? '' : '创建后在房间“材质 → 地面”中选择。'}</small>
      </div>
    </div>
    {extra}
    {!accountOnly && <div className="account-catalog-option"><Checkbox id="floor-account" checked={account} disabled={saving} onCheckedChange={v => setAccount(v === true)} /><Label htmlFor="floor-account" className="text-[11px]">同时添加到账号库</Label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>取消</Button><Button type="submit" disabled={saving}>{!initial && <Plus />}{saving ? '正在保存…' : submitLabel ?? '创建地面'}</Button></div>
  </form>;
}
