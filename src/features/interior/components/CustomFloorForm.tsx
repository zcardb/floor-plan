import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { uid, type CustomFloor, type FloorPattern } from '../model/types';
import { customFloorMaterial, floorPatterns, validCustomFloor } from '../model/floorMaterials';
import { parseMeterDraft } from '../model/lengthUnits';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorPickerField } from './ColorPickerField';
import { FloorSwatch } from './FloorSwatch';
import { notify } from '@/lib/notify';

type Props = { categoryField: ReactNode; accountOnly: boolean; onCancel: () => void; onSave: (floor: CustomFloor, account: boolean) => Promise<void> };

export function CustomFloorForm({ categoryField, accountOnly, onCancel, onSave }: Props) {
  const [name, setName] = useState(''), [pattern, setPattern] = useState<FloorPattern>('tile'), [length, setLength] = useState('0.8'), [width, setWidth] = useState('0.8'),
    [color, setColor] = useState('#e6dfd3'), [price, setPrice] = useState(''), [account, setAccount] = useState(accountOnly), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const seamless = pattern === 'seamless';
  const floor = (): CustomFloor => ({
    key: 'custom-' + uid(), name: name.trim(), pattern, color, price: price.trim() === '' ? null : Number(price),
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
        <div className="custom-field"><Label htmlFor="floor-name">名称</Label><Input id="floor-name" aria-label="地面名称" maxLength={100} required value={name} onChange={e => setName(e.target.value)} /></div>
        {categoryField}
        <div className="custom-field"><Label htmlFor="floor-pattern">铺贴样式</Label><Select value={pattern} onValueChange={value => setPattern(value as FloorPattern)}><SelectTrigger id="floor-pattern"><SelectValue /></SelectTrigger><SelectContent>{floorPatterns.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        {!seamless && <div className="custom-dimensions">
          <div className="custom-field"><Label htmlFor="floor-length">{pattern === 'plank' ? '板长 m' : '砖长 m'}</Label><Input id="floor-length" type="number" step={0.01} min={0.05} max={20} value={length} onChange={e => setLength(e.target.value)} /></div>
          <div className="custom-field"><Label htmlFor="floor-width">{pattern === 'plank' ? '板宽 m' : '砖宽 m'}</Label><Input id="floor-width" type="number" step={0.01} min={0.05} max={20} value={width} onChange={e => setWidth(e.target.value)} /></div>
        </div>}
        <div className="custom-field"><Label htmlFor="floor-price">单价 / 元每 m²</Label><Input id="floor-price" type="number" min={0} placeholder="未定价" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <ColorPickerField label="地面颜色" value={color} onChange={setColor} disabled={saving} />
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview custom-floor-preview"><FloorSwatch material={preview} /><span>{floorPatterns.find(p => p.value === pattern)?.label} · 平面图预览</span></div>
        <small>地面按参数绘制纹理，不生成图片、不消耗 AI 额度。创建后在房间“材质 → 地面”中选择。</small>
      </div>
    </div>
    {!accountOnly && <div className="account-catalog-option"><Checkbox id="floor-account" checked={account} disabled={saving} onCheckedChange={v => setAccount(v === true)} /><Label htmlFor="floor-account" className="text-[11px]">同时添加到账号库</Label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>取消</Button><Button type="submit" disabled={saving}><Plus />{saving ? '正在保存…' : '创建地面'}</Button></div>
  </form>;
}
