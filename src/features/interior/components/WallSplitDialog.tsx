import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { length } from '../model/geometry';
import { WallSplitPreview } from './WallSplitPreview';
import { formatMeters, meterDraft, parseMeterDraft } from '../model/lengthUnits';
import { wallSplitIntervals } from '../model/wallSplit';
import type { Design } from '../model/types';
import { notify } from '@/lib/notify';

export function WallSplitDialog({ design, wallId, onApply, onClose }: {
  design: Design; wallId: string; onApply: (cuts: number[], selectedSegment: number) => void; onClose: () => void;
}) {
  const wall = design.walls.find(w => w.id === wallId)!;
  const L = length(wall);
  const [mode, setMode] = useState<1 | 2>(1);
  const [first, setFirst] = useState(meterDraft(Math.min(300, L / 2)));
  const [second, setSecond] = useState(meterDraft(Math.min(800, L * 0.75)));
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  const cuts = [parseMeterDraft(first), ...(mode === 2 ? [parseMeterDraft(second)] : [])];
  let intervals: number[] = [], validation = '';
  try { intervals = wallSplitIntervals(design, wallId, cuts); }
  catch (e) { validation = e instanceof Error ? e.message : '分割距离无效'; }
  const apply = () => {
    try { if (validation) throw new Error(validation); onApply(cuts, selected); notify.success(`墙段已分割为 ${cuts.length + 1} 段，已选中第 ${selected + 1} 段`); }
    catch (e) { const message = e instanceof Error ? e.message : '分割失败'; setError(message); notify.fail('墙段未分割：' + message); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="wall-split-dialog" onKeyDown={e => e.stopPropagation()}>
      <DialogHeader><DialogTitle>分割墙段</DialogTitle><DialogDescription>仅将图纸上的墙分成独立对象，不切割真实结构。分割后选中需要的子段，再标记承重。</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label>分割模式</Label><div className="flex flex-wrap gap-2">
        {([1, 2] as const).map(value => <Button key={value} type="button" variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value} onClick={() => { setMode(value); setSelected(0); setError(''); }}>{value === 1 ? '单点分割' : '两点分割'}</Button>)}
      </div></div>
      <div className="wall-split-preview" aria-label="墙段方向及分割示意">
        <div className="flex justify-between text-sm"><b>局部户型示意</b><span>全长 {formatMeters(L)} m</span></div>
        <WallSplitPreview design={design} wallId={wallId} intervals={intervals} selected={selected} />
        <p className="text-xs text-muted-foreground">示意方向与平面图一致，距离从 A 量起；高亮为应用后选中的墙段。</p>
        <div className="wall-split-band">{intervals.slice(0, -1).map((start, i) => <span key={i} className={selected === i ? 'is-selected' : ''}>{i + 1} · {formatMeters(intervals[i + 1] - start)} m</span>)}</div>
        {intervals.length > 0 && <p className="text-xs text-muted-foreground">分割点距 A：{intervals.slice(1, -1).map(formatMeters).join(' / ')} m（下方段条不按比例）</p>}
      </div>
      <div className="space-y-2"><Label htmlFor="wall-split-first">分割点 1 · 距 A（米）</Label><Input id="wall-split-first" inputMode="decimal" autoFocus value={first} onChange={e => { setFirst(e.target.value); setError(''); }} /></div>
      {mode === 2 && <div className="space-y-2"><Label htmlFor="wall-split-second">分割点 2 · 距 A（米）</Label><Input id="wall-split-second" inputMode="decimal" value={second} onChange={e => { setSecond(e.target.value); setError(''); }} /></div>}
      {intervals.length > 0 && <div className="space-y-2"><Label>应用后选中</Label><div className="flex flex-wrap gap-2">{intervals.slice(0, -1).map((start, i) => <Button key={i} type="button" variant={selected === i ? 'default' : 'outline'} aria-pressed={selected === i} onClick={() => setSelected(i)}>第 {i + 1} 段 · {formatMeters(intervals[i + 1] - start)} m</Button>)}</div></div>}
      <p className="text-xs text-muted-foreground">每段至少 0.05 m；不能在门窗洞口内分割。所有子段继承原承重属性，原始承重墙不能解除锁定。</p>
      {(error || validation) && <p role="alert" className="text-sm text-destructive">{error || validation}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="button" disabled={!!validation} onClick={apply}>应用分割</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
