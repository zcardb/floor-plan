import { useState, type ReactNode } from 'react';
import { Paintbrush, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { uid, type CustomWall } from '../model/types';
import { validCustomWall } from '../model/hardMaterials';
import { ColorPickerField } from './ColorPickerField';
import { notify } from '@/lib/notify';

type Props = { categoryField: ReactNode; accountOnly: boolean; onCancel: () => void; onSave: (wall: CustomWall, account: boolean) => Promise<void> };

export function CustomWallForm({ categoryField, accountOnly, onCancel, onSave }: Props) {
  const [name, setName] = useState(''), [color, setColor] = useState('#e8e1d4'), [price, setPrice] = useState(''),
    [account, setAccount] = useState(accountOnly), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const submit = async () => {
    const item: CustomWall = { key: 'custom-' + uid(), name: name.trim(), color, price: price.trim() === '' ? null : Number(price) };
    if (!validCustomWall(item)) { const message = '请填写名称及非负单价'; setError(message); notify.fail(message); return; }
    setSaving(true); setError('');
    try { await onSave(item, account || accountOnly); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); notify.error('墙面「' + item.name + '」保存失败', e); }
    finally { setSaving(false); }
  };
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={saving}>
        <div className="custom-field"><Label htmlFor="wall-name">名称</Label><Input id="wall-name" aria-label="墙面名称" maxLength={100} required placeholder="如：艺术涂料" value={name} onChange={e => setName(e.target.value)} /></div>
        {categoryField}
        <div className="custom-field"><Label htmlFor="wall-price">单价 / 元每 m²</Label><Input id="wall-price" type="number" min={0} placeholder="未定价" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <ColorPickerField label="墙面颜色" value={color} onChange={setColor} disabled={saving} />
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview custom-material-preview"><span className="custom-material-swatch" style={{ background: color }}><Paintbrush size={30} strokeWidth={1.4} /></span><span>{name.trim() || '墙面材料'} · 色块预览</span></div>
        <small>墙面按房间周长 × 层高、扣除门窗面积计价，不生成图片。创建后在房间“材质 → 墙面”中选择。</small>
      </div>
    </div>
    {!accountOnly && <div className="account-catalog-option"><Checkbox id="wall-account" checked={account} disabled={saving} onCheckedChange={v => setAccount(v === true)} /><Label htmlFor="wall-account" className="text-[11px]">同时添加到账号库</Label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>取消</Button><Button type="submit" disabled={saving}><Plus />{saving ? '正在保存…' : '创建墙面'}</Button></div>
  </form>;
}
