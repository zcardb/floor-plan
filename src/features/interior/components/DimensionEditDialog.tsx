import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dimensionEditPolicy, type FixedDimensionSide } from '../model/dimensionWallEdit';
import { formatMeters, meterDraft, parseMeterDraft } from '../model/lengthUnits';
import type { Design } from '../model/types';
import type { DimensionBinding } from '../model/dimensionBinding';
export function DimensionEditDialog({ design, binding, onApply, onClose }: {
  design: Design; binding: DimensionBinding; onApply: (millimeters: number, fixed: FixedDimensionSide) => void; onClose: () => void;
}) {
  const policy = dimensionEditPolicy(design, binding);
  const initialDraft = meterDraft(binding.end - binding.start);
  const [draft, setDraft] = useState(initialDraft);
  const [fixed, setFixed] = useState<FixedDimensionSide | ''>(policy.fixed || '');
  const [error, setError] = useState('');
  const horizontal = binding.axis === 0;
  const apply = () => {
    if (draft.trim() === initialDraft) { onClose(); return; }
    try {
      if (!fixed) throw new Error('请选择固定侧');
      onApply(parseMeterDraft(draft), fixed);
    } catch (e) { setError(e instanceof Error ? e.message : '尺寸修改失败'); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="dimension-edit-dialog">
      <DialogHeader><DialogTitle>编辑墙间净距</DialogTitle><DialogDescription>固定侧不动，另一侧隔墙移动；连接墙端点同步伸缩，门窗随所属墙移动。</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor="dimension-gap">净距离（米）</Label><Input id="dimension-gap" inputMode="decimal" autoFocus value={draft} aria-invalid={!!error}
        onChange={e => { setDraft(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} />
        <p className="text-sm text-muted-foreground">当前 {formatMeters(binding.end - binding.start)} m · 数字修改会改变真实墙体位置</p></div>
      {policy.chooseSide ? <div className="space-y-2"><Label>固定侧</Label><div className="flex gap-2">
        <Button type="button" variant={fixed === 'start' ? 'default' : 'outline'} onClick={() => setFixed('start')}>固定{horizontal ? '左' : '上'}侧</Button>
        <Button type="button" variant={fixed === 'end' ? 'default' : 'outline'} onClick={() => setFixed('end')}>固定{horizontal ? '右' : '下'}侧</Button>
      </div></div> : <p className="text-sm text-muted-foreground">{policy.fixed === 'start' ? (horizontal ? '左' : '上') : (horizontal ? '右' : '下')}侧固定结构保持不动</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={apply}>应用距离</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
