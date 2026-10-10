import { useState, type ReactNode } from 'react';
import { Home, PanelTop, Paintbrush, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { uid, type CustomWall } from '../model/types';
import { validCustomWall, type SurfaceKind } from '../model/hardMaterials';
import { ColorPickerField } from './ColorPickerField';
import { notify } from '@/lib/notify';
import { parsePriceDraft, priceDraft, type MaterialFormEdit } from './materialFormEdit';

type Props = { kind: SurfaceKind; categoryField: ReactNode; accountOnly: boolean; onCancel: () => void; onSave: (item: CustomWall, account: boolean) => Promise<void> } & MaterialFormEdit<CustomWall>;

const copy = {
  wall: { label: '墙面', icon: Paintbrush, color: '#e8e1d4', placeholder: '如：艺术涂料', hint: '墙面按房间周长 × 层高、扣除门窗面积计价，不生成图片。', use: '创建后在房间“材质 → 墙面”中选择。' },
  roof: { label: '屋面', icon: Home, color: '#8b5a3c', placeholder: '如：仿古琉璃瓦', hint: '屋面按房间面积 ÷ cos(坡度) 计价，只计入硬装成本，不在 2D / 3D 中显示。', use: '创建后在房间“材质 → 屋面”中选择。' },
  ceiling: { label: '吊顶', icon: PanelTop, color: '#f1efe9', placeholder: '如：双层石膏板吊顶', hint: '吊顶按房间面积计价，只计入硬装成本，不在 2D / 3D 中显示。', use: '创建后在房间“材质 → 吊顶”中选择。' },
} as const;

/** 墙面 / 屋面 / 吊顶共用的「名称 + 颜色 + 单价/m²」表单，新建与查看弹窗共用。 */
export function CustomColorMaterialForm({ kind, categoryField, accountOnly, onCancel, onSave, initial, priceOnly = false, submitLabel, priceLabel = '单价 / 元每 m²', priceHint, extra }: Props) {
  const text = copy[kind], Icon = text.icon;
  const [name, setName] = useState(initial?.name ?? ''), [color, setColor] = useState<string>(initial?.color ?? text.color), [price, setPrice] = useState(priceDraft(initial?.price)),
    [account, setAccount] = useState(accountOnly), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [key] = useState(() => initial?.key ?? 'custom-' + uid());
  const locked = saving || priceOnly;
  const submit = async () => {
    const item: CustomWall = { key, name: name.trim(), color, price: parsePriceDraft(price) };
    if (!validCustomWall(item)) { const message = '请填写名称及非负单价'; setError(message); notify.fail(message); return; }
    setSaving(true); setError('');
    try { await onSave(item, account || accountOnly); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); notify.error(text.label + '「' + item.name + '」保存失败', e); }
    finally { setSaving(false); }
  };
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={saving}>
        <div className="custom-field"><Label htmlFor={kind + '-name'}>名称</Label><Input id={kind + '-name'} aria-label={text.label + '名称'} maxLength={100} required disabled={locked} placeholder={text.placeholder} value={name} onChange={e => setName(e.target.value)} /></div>
        {categoryField}
        <div className="custom-field"><Label htmlFor={kind + '-price'}>{priceLabel}</Label><Input id={kind + '-price'} type="number" min={0} placeholder="未定价" value={price} onChange={e => setPrice(e.target.value)} />{priceHint && <small className="custom-field-hint">{priceHint}</small>}</div>
        <ColorPickerField label={text.label + '颜色'} value={color} onChange={setColor} disabled={locked} />
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview custom-material-preview"><span className="custom-material-swatch" style={{ background: color }}><Icon size={30} strokeWidth={1.4} /></span><span>{name.trim() || text.label + '材料'} · 色块预览</span></div>
        <small>{text.hint}{initial ? '' : text.use}</small>
      </div>
    </div>
    {extra}
    {!accountOnly && <div className="account-catalog-option"><Checkbox id={kind + '-account'} checked={account} disabled={saving} onCheckedChange={v => setAccount(v === true)} /><Label htmlFor={kind + '-account'} className="text-[11px]">同时添加到账号库</Label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>取消</Button><Button type="submit" disabled={saving}>{!initial && <Plus />}{saving ? '正在保存…' : submitLabel ?? '创建' + text.label}</Button></div>
  </form>;
}
