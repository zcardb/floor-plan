import { useMemo, useState } from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { length } from '@/lib/floor-plan/geometry';
import { WallSplitPreview } from './wall-split-preview';
import { formatMeters, meterDraft, parseMeterDraft } from '@/lib/floor-plan/length-units';
import { contactDistances, originalSegment, wallSplitDraft } from '../model/wall-split-draft';
import { wallContacts, type WallContact } from '../model/wall-contacts';
import { isBearingWall } from '@/lib/floor-plan/wall-policy';
import { wallDisplayName } from '../model/wall-label';
import { openingKindLabel } from '@/lib/floor-plan/hard-materials';
import type { Design } from '@/lib/floor-plan/types';
import { notify } from '@/lib/notify';

type SplitMode = 1 | 2 | 'contact';
/** 接触点分割放第一位并作为默认（默认效应）：大多数分割都是在相接墙处断开。 */
const modes: { value: SplitMode; label: string }[] = [
  { value: 'contact', label: '接触点分割' },
  { value: 1, label: '单点分割' },
  { value: 2, label: '两点分割' },
];
const kinds = { tee: 'T 形交接', cross: '十字穿过', opening: '门窗洞口' } as const;
const StepTitle = ({ no, children }: { no: number; children: React.ReactNode }) =>
  <span className="wall-split-step-title"><i className="wall-split-step-no" aria-hidden="true">{no}</i>{children}</span>;

export function WallSplitDialog({ design, wallId, onApply, onClose }: {
  design: Design; wallId: string; onApply: (cuts: number[], selectedSegment: number) => void; onClose: () => void;
}) {
  const wall = design.walls.find(w => w.id === wallId)!;
  const L = length(wall);
  const contacts = useMemo(() => wallContacts(design, wallId), [design, wallId]);
  const usable = contacts.filter(c => !c.blocked);
  // 有可用接触点时默认按接触点分割；没有时退回单点分割。
  const [mode, setMode] = useState<SplitMode>(() => usable.length ? 'contact' : 1);
  const [reversed, setReversed] = useState(false);
  const [first, setFirst] = useState(meterDraft(Math.min(300, L / 2)));
  const [second, setSecond] = useState(meterDraft(Math.min(800, L * 0.75)));
  const [focus, setFocus] = useState<'first' | 'second'>('first');
  // Picked junctions are held by offset, so a re-cut wall keeps the selection the user sees.
  const [picked, setPicked] = useState<number[]>(() => usable.map(c => c.offset));
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const distances = mode === 'contact'
    ? contactDistances(L, picked.slice().sort((a, b) => a - b), reversed)
    : [parseMeterDraft(first), ...(mode === 2 ? [parseMeterDraft(second)] : [])];
  const draft = wallSplitDraft(design, wallId, L, distances, reversed);
  const count = draft.intervals.length - 1;
  // Segment lengths read from the shown A, so card 1 is always the piece next to A.
  const lengths = draft.intervals.slice(1).map((end, i) => end - draft.intervals[i]);
  const shown = reversed ? lengths.slice().reverse() : lengths;
  const stored = originalSegment(count, selected, reversed);
  const showValidation = !!draft.error && touched;
  const inherit = isBearingWall(wall) ? '所有子段继承承重标记，可再单独取消。' : '子段不会自动标记承重，分割后再按需标记。';
  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { setter(e.target.value); setError(''); };
  const setDistance = (offset: number) => {
    const value = meterDraft(contactDistances(L, [offset], reversed)[0]!);
    (focus === 'second' ? setSecond : setFirst)(value);
    setError('');
  };
  const toggle = (offset: number) => {
    setPicked(picked => picked.includes(offset) ? picked.filter(v => v !== offset) : [...picked, offset]);
    setSelected(0); setError('');
  };
  const apply = () => {
    setTouched(true);
    try {
      if (draft.error) throw new Error(draft.error);
      onApply(draft.cuts, stored);
      notify.success(`墙段已分割为 ${count} 段，已选中第 ${selected + 1} 段`);
    } catch (e) { const message = e instanceof Error ? e.message : '分割失败'; setError(message); notify.fail('墙段未分割：' + message); }
  };
  /** 门窗边接触点：按当前显示方向说明切在哪一侧边缘。 */
  const edgeLabel = (contact: WallContact) => {
    const start = contact.opening!.edge === 'start';
    return (reversed ? !start : start) ? '近 A 侧' : '近 B 侧';
  };
  const describedBy = showValidation ? 'wall-split-error' : 'wall-split-hint';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="wall-split-dialog" onKeyDown={e => e.stopPropagation()}>
      <DialogHeader><DialogTitle>分割墙段</DialogTitle><DialogDescription>分割后各段可单独编辑；墙体位置和总长不变。</DialogDescription></DialogHeader>
      <div className="wall-split-modebar">
        <div className="wall-split-segmented" role="group" aria-label="分割模式">
          {modes.map(({ value, label }) => <button key={label} type="button" aria-label={label} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''}
            onClick={() => { setMode(value); setSelected(0); setError(''); }}>{label}{value === 'contact' && usable.length > 0 && <em className="wall-split-badge">推荐</em>}</button>)}
        </div>
        <span className="wall-split-count">{wallDisplayName(design, wall)} · 全长 {formatMeters(L)} m</span>
      </div>
      <div className="wall-split-body">
        <section className="wall-split-figure" aria-label="墙段方向及分割示意">
          <div className="wall-split-figure-head"><b>局部户型</b>
            <Button type="button" variant="ghost" size="sm" className="wall-split-swap" aria-label="交换 A/B" onClick={() => { setReversed(r => !r); setError(''); }}><ArrowLeftRight size={14} />交换 A/B</Button>
          </div>
          <WallSplitPreview design={design} wallId={wallId} intervals={draft.intervals} selected={stored} reversed={reversed} contacts={contacts} />
          <p className="wall-split-caption">{reversed ? '已交换：从另一端开始量取' : '距离从 A 起点量取'} · 图纸方向不变</p>
        </section>
        <section className="wall-split-form">
          {mode === 'contact' ? <div className="wall-split-step">
            <div className="wall-split-step-head"><StepTitle no={1}>选择相接墙位置</StepTitle>
              {contacts.length > 0 && <span className="wall-split-step-tools">
                <span className="wall-split-hint" role="status">已选 {picked.length} / {usable.length}</span>
                <button type="button" className="wall-split-link" disabled={picked.length === usable.length} onClick={() => { setPicked(usable.map(c => c.offset)); setSelected(0); setError(''); }}>全选</button>
                <button type="button" className="wall-split-link" disabled={!picked.length} onClick={() => { setPicked([]); setSelected(0); setError(''); }}>清空</button>
              </span>}
            </div>
            {contacts.length ? <>
              <div className="wall-split-contacts" role="group" aria-label="接触点">
                {contacts.map((contact, i) => <button key={contact.offset} type="button" disabled={contact.blocked}
                  aria-label={`接触点 ${i + 1}${contact.blocked ? '（位于门窗洞口内）' : ''}`} aria-pressed={picked.includes(contact.offset)}
                  className={picked.includes(contact.offset) ? 'wall-split-contact is-active' : 'wall-split-contact'} onClick={() => toggle(contact.offset)}>
                  <i className="wall-split-check" aria-hidden="true">{picked.includes(contact.offset) && <Check size={12} strokeWidth={3} />}</i>
                  <span className="wall-split-contact-title"><b>接触点 {i + 1}</b><em className="wall-split-contact-dist">{`距 A ${formatMeters(contactDistances(L, [contact.offset], reversed)[0]!)} m`}</em></span>
                  <small>{contact.blocked ? '位于门窗洞口内，不能作为分割点' : contact.opening
                    ? `${openingKindLabel(contact.opening.kind)}洞口${edgeLabel(contact)}边缘`
                    : <><span>{kinds[contact.kind]}</span> · {contact.wallIds.map(id => { const w = design.walls.find(x => x.id === id); return w ? wallDisplayName(design, w) : '相接墙'; }).join('、')}</>}</small>
                </button>)}
              </div>
            </> : <p className="wall-split-hint">本墙没有其他墙相接，也没有门窗洞口，可使用单点或两点分割</p>}
            {showValidation ? <p id="wall-split-error" role="alert" className="wall-split-error">{draft.error}</p> : null}
          </div> : <div className="wall-split-step"><StepTitle no={1}>分割距离 · 距 A（米）</StepTitle>
            <div className={mode === 2 ? 'wall-split-inputs is-pair' : 'wall-split-inputs'}>
              <div><Label htmlFor="wall-split-first">点 1</Label><Input id="wall-split-first" inputMode="decimal" autoFocus value={first} aria-invalid={showValidation} aria-describedby={describedBy}
                onChange={edit(setFirst)} onFocus={() => setFocus('first')} onBlur={() => setTouched(true)} /></div>
              {mode === 2 && <div><Label htmlFor="wall-split-second">点 2</Label><Input id="wall-split-second" inputMode="decimal" value={second} aria-invalid={showValidation} aria-describedby={describedBy}
                onChange={edit(setSecond)} onFocus={() => setFocus('second')} onBlur={() => setTouched(true)} /></div>}
            </div>
            {usable.length > 0 && <div className="wall-split-quick">
              <span className="wall-split-quick-label">一键填入接触点</span>
              <div className="wall-split-chips" role="group" aria-label="接触点快捷填入">
                {usable.map((contact, i) => <button key={contact.offset} type="button" className="wall-split-chip" aria-label={`填入接触点 ${i + 1} 距离`}
                  onClick={() => setDistance(contact.offset)}>接触点 {i + 1}<b>{formatMeters(contactDistances(L, [contact.offset], reversed)[0]!)} m</b></button>)}
              </div>
            </div>}
            {showValidation ? <p id="wall-split-error" role="alert" className="wall-split-error">{draft.error}</p>
              : <p id="wall-split-hint" className="wall-split-hint">{draft.error ? '输入有效距离后显示结果' : '每段至少 0.05 m，不能落在门窗洞口内'}</p>}
          </div>}
          {/* 次要设置：应用后默认选中哪一段，弱化展示，不和第 1 步抢注意力。 */}
          <div className="wall-split-step is-secondary"><span className="wall-split-substep">应用后选中</span>
            {count > 0 ? <div className="wall-split-results">{shown.map((segment, i) => <button key={i} type="button" aria-label={`选中第 ${i + 1} 段`} aria-pressed={selected === i}
              title={i === 0 ? '靠近 A' : i === count - 1 ? '靠近 B' : '中间段'}
              className={selected === i ? 'wall-split-result is-active' : 'wall-split-result'} onClick={() => setSelected(i)}>
              <span>第 {i + 1} 段</span><b>{formatMeters(segment)} m</b>
            </button>)}</div> : <p className="wall-split-hint">距离有效后可选择墙段</p>}
          </div>
          <p className="wall-split-note">{inherit}</p>
          {error && <p role="alert" className="wall-split-error">{error}</p>}
        </section>
      </div>
      <DialogFooter className="wall-split-footer">
        <p className="wall-split-summary" role="status">{count > 0 ? <>将得到 <b>{count}</b> 段，应用后选中第 <b>{selected + 1}</b> 段（{formatMeters(shown[selected] ?? 0)} m）</> : '距离有效后显示分割结果'}</p><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="button" disabled={!!draft.error} onClick={apply}>应用分割</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
