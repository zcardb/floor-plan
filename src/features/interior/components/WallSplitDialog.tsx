import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { length } from '../model/geometry';
import { WallSplitPreview } from './WallSplitPreview';
import { formatMeters, meterDraft, parseMeterDraft } from '../model/lengthUnits';
import { originalSegment, wallSplitDraft } from '../model/wallSplitDraft';
import { isBearingWall } from '../model/wallPolicy';
import type { Design } from '../model/types';
import { notify } from '@/lib/notify';

export function WallSplitDialog({ design, wallId, onApply, onClose }: {
  design: Design; wallId: string; onApply: (cuts: number[], selectedSegment: number) => void; onClose: () => void;
}) {
  const wall = design.walls.find(w => w.id === wallId)!;
  const L = length(wall);
  const [mode, setMode] = useState<1 | 2>(1);
  const [reversed, setReversed] = useState(false);
  const [first, setFirst] = useState(meterDraft(Math.min(300, L / 2)));
  const [second, setSecond] = useState(meterDraft(Math.min(800, L * 0.75)));
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const distances = [parseMeterDraft(first), ...(mode === 2 ? [parseMeterDraft(second)] : [])];
  const draft = wallSplitDraft(design, wallId, L, distances, reversed);
  const count = draft.intervals.length - 1;
  // Segment lengths read from the shown A, so card 1 is always the piece next to A.
  const lengths = draft.intervals.slice(1).map((end, i) => end - draft.intervals[i]);
  const shown = reversed ? lengths.slice().reverse() : lengths;
  const stored = originalSegment(count, selected, reversed);
  const showValidation = !!draft.error && touched;
  const inherit = wall.kind === 'bearing' ? '原始承重墙：分割后所有子段保持锁定。' : isBearingWall(wall) ? '所有子段继承承重标记，可再单独取消。' : '子段不会自动标记承重，分割后再按需标记。';
  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { setter(e.target.value); setError(''); };
  const apply = () => {
    setTouched(true);
    try {
      if (draft.error) throw new Error(draft.error);
      onApply(draft.cuts, stored);
      notify.success(`墙段已分割为 ${count} 段，已选中第 ${selected + 1} 段`);
    } catch (e) { const message = e instanceof Error ? e.message : '分割失败'; setError(message); notify.fail('墙段未分割：' + message); }
  };
  const describedBy = showValidation ? 'wall-split-error' : 'wall-split-hint';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="wall-split-dialog" onKeyDown={e => e.stopPropagation()}>
      <DialogHeader><DialogTitle>分割墙段</DialogTitle><DialogDescription>按距离把墙分成独立墙段，不改变真实墙体。</DialogDescription></DialogHeader>
      <div className="wall-split-modebar">
        <div className="wall-split-segmented" role="group" aria-label="分割模式">
          {([1, 2] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? 'is-active' : ''}
            onClick={() => { setMode(value); setSelected(0); setError(''); }}>{value === 1 ? '单点分割' : '两点分割'}</button>)}
        </div>
        <span className="wall-split-count">得到 {mode + 1} 段 · 全长 {formatMeters(L)} m</span>
      </div>
      <div className="wall-split-body">
        <section className="wall-split-figure" aria-label="墙段方向及分割示意">
          <div className="wall-split-figure-head"><b>局部户型</b>
            <Button type="button" variant="ghost" size="sm" className="wall-split-swap" aria-label="交换 A/B" onClick={() => { setReversed(r => !r); setError(''); }}><ArrowLeftRight size={14} />交换 A/B</Button>
          </div>
          <WallSplitPreview design={design} wallId={wallId} intervals={draft.intervals} selected={stored} reversed={reversed} />
          <p className="wall-split-caption">{reversed ? '已交换：从另一端开始量取' : '距离从 A 起点量取'} · 图纸方向不变</p>
        </section>
        <section className="wall-split-form">
          <div className="wall-split-step"><span className="wall-split-step-title">分割距离 · 距 A（米）</span>
            <div className={mode === 2 ? 'wall-split-inputs is-pair' : 'wall-split-inputs'}>
              <div><Label htmlFor="wall-split-first">点 1</Label><Input id="wall-split-first" inputMode="decimal" autoFocus value={first} aria-invalid={showValidation} aria-describedby={describedBy} onChange={edit(setFirst)} onBlur={() => setTouched(true)} /></div>
              {mode === 2 && <div><Label htmlFor="wall-split-second">点 2</Label><Input id="wall-split-second" inputMode="decimal" value={second} aria-invalid={showValidation} aria-describedby={describedBy} onChange={edit(setSecond)} onBlur={() => setTouched(true)} /></div>}
            </div>
            {showValidation ? <p id="wall-split-error" role="alert" className="wall-split-error">{draft.error}</p>
              : <p id="wall-split-hint" className="wall-split-hint">{draft.error ? '输入有效距离后显示结果' : '每段至少 0.05 m，不能落在门窗洞口内'}</p>}
          </div>
          <div className="wall-split-step"><span className="wall-split-step-title">应用后选中</span>
            {count > 0 ? <div className="wall-split-results">{shown.map((segment, i) => <button key={i} type="button" aria-label={`选中第 ${i + 1} 段`} aria-pressed={selected === i}
              className={selected === i ? 'wall-split-result is-active' : 'wall-split-result'} onClick={() => setSelected(i)}>
              <span>第 {i + 1} 段</span><b>{formatMeters(segment)} m</b><small>{i === 0 ? '靠近 A' : i === count - 1 ? '靠近 B' : '中间段'}</small>
            </button>)}</div> : <p className="wall-split-hint">距离有效后可选择墙段</p>}
          </div>
          <p className="wall-split-note">{inherit}</p>
          {error && <p role="alert" className="wall-split-error">{error}</p>}
        </section>
      </div>
      <DialogFooter className="wall-split-footer"><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="button" disabled={!!draft.error} onClick={apply}>应用分割</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
