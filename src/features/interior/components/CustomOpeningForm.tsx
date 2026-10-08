import { useState, type ReactNode } from 'react';
import { DoorOpen, PanelsTopLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uid, type CustomOpening } from '../model/types';
import { defaultOpeningSize, openingKinds, validCustomOpening } from '../model/hardMaterials';
import { formatMeters, parseMeterDraft } from '../model/lengthUnits';
import { notify } from '@/lib/notify';

type Props = { categoryField: ReactNode; accountOnly: boolean; onCancel: () => void; onSave: (opening: CustomOpening, account: boolean) => Promise<void> };
const meters = (mm: number) => String(mm / 1000);

export function CustomOpeningForm({ categoryField, accountOnly, onCancel, onSave }: Props) {
  const [name, setName] = useState(''), [kind, setKind] = useState<CustomOpening['kind']>('door'),
    [width, setWidth] = useState(meters(900)), [height, setHeight] = useState(meters(2100)), [price, setPrice] = useState(''),
    [account, setAccount] = useState(accountOnly), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const switchKind = (next: CustomOpening['kind']) => { const size = defaultOpeningSize(next); setKind(next); setWidth(meters(size.width)); setHeight(meters(size.height)); };
  const Icon = kind === 'door' ? DoorOpen : PanelsTopLeft;
  const submit = async () => {
    const item: CustomOpening = { key: 'custom-' + uid(), name: name.trim(), kind, width: parseMeterDraft(width), height: parseMeterDraft(height), price: price.trim() === '' ? null : Number(price) };
    if (!validCustomOpening(item)) { const message = '请填写名称、宽 0.1～10 m、高 0.1～8 m 及非负单价'; setError(message); notify.fail(message); return; }
    setSaving(true); setError('');
    try { await onSave(item, account || accountOnly); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); notify.error('门窗「' + item.name + '」保存失败', e); }
    finally { setSaving(false); }
  };
  const w = parseMeterDraft(width), h = parseMeterDraft(height);
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={saving}>
        <div className="custom-field"><Label htmlFor="opening-name">名称</Label><Input id="opening-name" aria-label="门窗名称" maxLength={100} required placeholder={kind === 'door' ? '如：实木平开门' : '如：断桥铝推拉窗'} value={name} onChange={e => setName(e.target.value)} /></div>
        {categoryField}
        <div className="custom-field"><Label htmlFor="opening-kind">类型</Label><Select value={kind} onValueChange={value => switchKind(value as CustomOpening['kind'])}><SelectTrigger id="opening-kind"><SelectValue /></SelectTrigger><SelectContent>{openingKinds.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="custom-dimensions">
          <div className="custom-field"><Label htmlFor="opening-width">宽 m</Label><Input id="opening-width" type="number" step={0.01} min={0.1} max={10} value={width} onChange={e => setWidth(e.target.value)} /></div>
          <div className="custom-field"><Label htmlFor="opening-height">高 m</Label><Input id="opening-height" type="number" step={0.01} min={0.1} max={8} value={height} onChange={e => setHeight(e.target.value)} /></div>
        </div>
        <div className="custom-field"><Label htmlFor="opening-price">单价 / 元每 m²</Label><Input id="opening-price" type="number" min={0} placeholder="未定价" value={price} onChange={e => setPrice(e.target.value)} /></div>
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview custom-material-preview"><span className="custom-material-swatch"><Icon size={38} strokeWidth={1.3} /></span><span>{name.trim() || (kind === 'door' ? '门' : '窗')}{Number.isFinite(w) && Number.isFinite(h) ? ` · ${formatMeters(w)} × ${formatMeters(h)} m` : ''}</span></div>
        <small>按开口面积（宽 × 高）计价。创建后选中画布中的{kind === 'door' ? '门' : '窗'}，在“款式”中切换使用。</small>
      </div>
    </div>
    {!accountOnly && <div className="account-catalog-option"><Checkbox id="opening-account" checked={account} disabled={saving} onCheckedChange={v => setAccount(v === true)} /><Label htmlFor="opening-account" className="text-[11px]">同时添加到账号库</Label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" onClick={onCancel}>取消</Button><Button type="submit" disabled={saving}><Plus />{saving ? '正在保存…' : '创建门窗'}</Button></div>
  </form>;
}
