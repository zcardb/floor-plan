import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Design } from '../model/types';
import { setPrice, type PriceGroup } from '../model/costs';
import { PriceInput } from './PriceInput';
import { MaterialProcurementEditor } from './MaterialProcurementEditor';
export function AccountCostDialog({ group, entryKey, name, groupTitle, unit, design, change, price, done, busy = false, error = '', saved = false, retry }: {
  group: PriceGroup; entryKey: string; name: string; groupTitle: string; unit: string; design: Design;
  change: (fn: (design: Design) => Design) => void; price: number | null; done: () => void;
  busy?: boolean; error?: string; saved?: boolean; retry?: () => void;
}) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) done(); }}>
    <DialogContent className="cms-detail-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{groupTitle} · 账号默认单价 元 / {unit} · 应用后自动保存，未单独调价的项目自动继承。</DialogDescription></DialogHeader>
      <fieldset disabled={busy || !!retry} className="cms-detail-body single cost-edit-fields">
        <PriceInput key={entryKey + String(price)} value={price} label={name + '账号默认单价'} onApply={value => change(design => setPrice(design, group, entryKey, value))}/>
        <p className="footnote">留空并应用表示明确未定价，不再使用参考价，也不计入报价。</p>
        {group === 'floorPrices' && <MaterialProcurementEditor design={{ ...design, rooms: [] }} material={entryKey} change={change}/>}
      </fieldset>
      {error && <div className="cost-save-error" role="alert"><span>{error}</span>{retry && <Button variant="outline" disabled={busy} onClick={retry}>重试保存</Button>}</div>}
      <div className="cms-detail-actions"><span className="cost-sync" role="status">{busy ? '正在保存…' : saved && !error ? '已保存并生效' : '应用后自动保存'}</span><Button type="button" className="cms-detail-action" disabled={busy} onClick={done}>完成</Button></div>
    </DialogContent>
  </Dialog>;
}
