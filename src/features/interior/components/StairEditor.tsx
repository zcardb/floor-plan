import { useEffect, useState } from 'react';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import {
  STAIR_FLIGHT_MAX, STAIR_FLIGHT_MIN, STAIR_PRESETS, STAIR_STEPS_MAX, STAIR_STEPS_MIN,
  applyStairForm, stairFlightWidths, stairMetrics, stairSpec,
} from '../model/stairs';
import type { Design, Furniture, StairForm, StairSpec } from '../model/types';
import { StairPlan } from './StairPlan';
import { EditorSelect } from './EditorSelect';

const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } };
/** 米制梯段宽输入：失焦 / 回车提交，越界报错并回滚。 */
function MeterField({ label, value, onCommit, onError }: { label: string; value: number; onCommit: (mm: number) => void; onError: (text: string) => void }) {
  const [draft, setDraft] = useState(meterDraft(value));
  useEffect(() => setDraft(meterDraft(value)), [value]);
  const commit = () => {
    const mm = parseMeterDraft(draft);
    if (!Number.isFinite(mm) || mm < STAIR_FLIGHT_MIN || mm > STAIR_FLIGHT_MAX) {
      onError(`梯段宽需在 ${meterDraft(STAIR_FLIGHT_MIN)}–${meterDraft(STAIR_FLIGHT_MAX)} m 之间`);
      setDraft(meterDraft(value));
      return;
    }
    onError('');
    if (mm !== value) onCommit(mm);
  };
  return <Label className="field-label">{label}
    <Input className="editor-control" aria-label={label} type="number" step={0.01} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={enterBlurs} />
  </Label>;
}

type Change = (fn: (d: Design) => Design) => void;
const updateFurniture = (change: Change, id: string, fn: (f: Furniture) => Furniture) =>
  change(d => ({ ...d, furniture: d.furniture.map(f => (f.id === id ? fn(f) : f)) }));

/** 楼梯专属编辑：类别、梯段宽、踏步数，以及按 GB 50096 套内楼梯推导的踏步尺寸提示。 */
export function StairEditor({ design, furniture, change }: { design: Design; furniture: Furniture; change: Change }) {
  const spec = stairSpec(furniture);
  const [steps, setSteps] = useState(String(spec.steps));
  const [error, setError] = useState('');
  useEffect(() => setSteps(String(spec.steps)), [spec.steps]);
  const patch = (next: Partial<StairSpec>) => updateFurniture(change, furniture.id, f => ({ ...f, stair: { ...stairSpec(f), ...next } }));
  const pickForm = (form: StairForm) => { setError(''); if (form !== spec.form) updateFurniture(change, furniture.id, f => applyStairForm(f, form)); };
  const widths = stairFlightWidths(spec), multi = widths.length > 1;
  /** 改某一跑宽度：写完整 flightWidths，flightWidth 同步为第 1 跑以兼容旧逻辑。 */
  const commitWidth = (index: number, mm: number) => {
    const next = widths.map((v, i) => (i === index ? mm : v));
    patch(multi ? { flightWidth: next[0], flightWidths: next } : { flightWidth: mm });
  };
  const commitSteps = (text: string) => {
    const value = Number(text);
    if (!Number.isInteger(value) || value < STAIR_STEPS_MIN || value > STAIR_STEPS_MAX) {
      setError(`踏步数需为 ${STAIR_STEPS_MIN}–${STAIR_STEPS_MAX} 的整数`);
      setSteps(String(spec.steps));
      return;
    }
    setError('');
    if (value !== spec.steps) patch({ steps: value });
  };
  const metrics = stairMetrics(spec, furniture.w, furniture.d, design.height);
  return <div className="stair-editor" onKeyDown={e => e.stopPropagation()}>
    <div className="stair-forms" role="radiogroup" aria-label="楼梯类别">
      {STAIR_PRESETS.map(p => <button key={p.form} type="button" role="radio" aria-checked={p.form === spec.form}
        className="stair-form-card" onClick={() => pickForm(p.form)}>
        <svg viewBox={`${-p.w / 2 - 80} ${-p.d / 2 - 80} ${p.w + 160} ${p.d + 160}`} className="furniture-drawing" aria-hidden="true">
          <StairPlan spec={{ form: p.form, flightWidth: p.flightWidth, steps: p.steps }} w={p.w} d={p.d} color={furniture.color} />
        </svg>
        <span>{p.name.replace('楼梯', '').trim()}</span>
      </button>)}
    </div>
    <div className="visual-size-fields">
      {widths.map((value, i) => <MeterField key={`${spec.form}-${i}`} label={multi ? `第 ${i + 1} 跑宽 / m` : '梯段宽 / m'} value={value}
        onCommit={mm => commitWidth(i, mm)} onError={setError} />)}
      <Label className="field-label">踏步数 / 级
        <span className="stair-steps">
          <Button type="button" variant="outline" size="icon" aria-label="减少一级" disabled={spec.steps <= STAIR_STEPS_MIN}
            onClick={() => commitSteps(String(spec.steps - 1))}><Minus /></Button>
          <Input className="editor-control" aria-label="踏步数" type="number" step={1} value={steps}
            onChange={e => setSteps(e.target.value)} onBlur={() => commitSteps(steps)} onKeyDown={enterBlurs} />
          <Button type="button" variant="outline" size="icon" aria-label="增加一级" disabled={spec.steps >= STAIR_STEPS_MAX}
            onClick={() => commitSteps(String(spec.steps + 1))}><Plus /></Button>
        </span>
      </Label>
    </div>
    <div className="stair-direction">
      <EditorSelect label="行走方向" value={spec.reverse ? 'reverse' : 'forward'}
        options={[{ value: 'forward', label: '正向 · 由此端起步' }, { value: 'reverse', label: '反向 · 由另一端起步' }]}
        onChange={value => patch({ reverse: value === 'reverse' })} />
      {multi && <EditorSelect label="转向" value={spec.hand ?? 'right'}
        options={[{ value: 'right', label: '右转' }, { value: 'left', label: '左转' }]}
        onChange={value => patch({ hand: value as StairSpec['hand'] })} />}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <dl className="stair-metrics">
      <div><dt>{spec.form === 'spiral' ? '踏步宽（距内侧 0.25 m）' : '踏步宽'}</dt><dd>{Math.round(metrics.treadDepth)} mm</dd></div>
      <div><dt>踏步高（层高 ÷ 踏步数）</dt><dd>{Math.round(metrics.riserHeight)} mm</dd></div>
    </dl>
    {metrics.warnings.map(text => <p key={text} className="stair-warning" role="note"><AlertTriangle size={14} />{text}</p>)}
    <p className="muted-note">依据 GB 50096 套内楼梯：梯段宽 ≥ 0.75 m，踏步宽 ≥ 0.22 m，踏步高 ≤ 0.20 m；外框长宽在「尺寸与位置」中修改。</p>
  </div>;
}
