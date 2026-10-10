import { useEffect, useState } from 'react';
import { AlertTriangle, Minus, Plus, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import {
  STAIR_FLIGHT_MAX, STAIR_FLIGHT_MIN, STAIR_LENGTH_MAX, STAIR_LENGTH_MIN, STAIR_PRESETS, STAIR_RISER_MAX, STAIR_RISER_MIN,
  STAIR_STEPS_MAX, STAIR_STEPS_MIN, STAIR_TREAD_MAX, STAIR_TREAD_MIN, STAIR_WELL_MAX, STAIR_WELL_MIN, applyStairForm, resizeStair,
  stairBoxTerms, stairFlightCount, stairFlightLengths, stairFlightWidths, stairMetrics, stairRiser, stairSpec, stairSteps, stairTread, stairWell,
} from '../model/stairs';
import type { Design, Furniture, StairForm, StairSpec } from '../model/types';
import { StairPlan } from './StairPlan';
import { EditorSelect } from './EditorSelect';

type Change = (fn: (d: Design) => Design) => void;
const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } };

/** 米制数字输入：失焦 / 回车提交，越界报错并回滚。 */
function MeterField({ label, value, onCommit, onError }: { label: string; value: number; onCommit: (mm: number) => void; onError: (text: string) => void }) {
  const [draft, setDraft] = useState(meterDraft(value));
  useEffect(() => setDraft(meterDraft(value)), [value]);
  const commit = () => {
    const mm = parseMeterDraft(draft);
    if (!Number.isFinite(mm)) { setDraft(meterDraft(value)); return; }
    if (mm === value) onError('');
    else onCommit(mm);
  };
  return <Label className="field-label">{label}
    <Input className="editor-control" aria-label={label} type="number" step={0.01} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={enterBlurs} />
  </Label>;
}

/** 类别卡片缩略图：按该类别标准梯段长推出外框，用当前踏步数与实际梯段宽绘制。 */
function previewOf(preset: { form: StairForm; flightWidth: number }, furniture: Furniture, steps: number, floorHeight: number) {
  const f = resizeStair({ ...furniture, stair: { form: preset.form, flightWidth: preset.flightWidth, steps } }, {}, floorHeight);
  return { stair: f.stair!, box: { w: f.w, d: f.d } };
}

/** 楼梯专属编辑：类别、各跑宽 / 长、踏步数与踏面 / 踏步高，以及按 GB 50096 推导的提示。 */
export function StairEditor({ design, furniture, change }: { design: Design; furniture: Furniture; change: Change }) {
  const spec = stairSpec(furniture), [error, setError] = useState(''), [steps, setSteps] = useState(String(spec.steps));
  useEffect(() => setSteps(String(spec.steps)), [spec.steps]);
  const update = (patch: Partial<StairSpec>, lengths?: number[]) =>
    change(d => ({ ...d, furniture: d.furniture.map(f => (f.id === furniture.id ? resizeStair(f, patch, design.height, lengths) : f)) }));
  const check = (mm: number, min: number, max: number, what: string) => {
    if (mm >= min && mm <= max) { setError(''); return true; }
    setError(`${what}需在 ${meterDraft(min)}–${meterDraft(max)} m 之间`);
    return false;
  };
  const pickForm = (form: StairForm) => { setError(''); if (form !== spec.form) change(d => ({ ...d, furniture: d.furniture.map(f => (f.id === furniture.id ? applyStairForm(f, form, design.height) : f)) })); };
  const setLength = (index: number, mm: number) => {
    if (!check(mm, STAIR_LENGTH_MIN, STAIR_LENGTH_MAX, '梯段长')) return;
    const lengths = stairFlightLengths(spec, furniture.w, furniture.d).map((v, i) => (i === index ? mm : v));
    update({}, lengths);
  };
  const setWidth = (index: number, mm: number) => {
    if (!check(mm, STAIR_FLIGHT_MIN, STAIR_FLIGHT_MAX, '梯段宽')) return;
    const widths = stairFlightWidths(spec).map((v, i) => (i === index ? mm : v));
    update({ flightWidth: widths[0], ...(widths.length > 1 ? { flightWidths: widths } : {}) });
  };
  const commitSteps = (text: string) => {
    const value = Number(text);
    if (!Number.isInteger(value) || value < STAIR_STEPS_MIN || value > STAIR_STEPS_MAX) {
      setError(`踏步数需为 ${STAIR_STEPS_MIN}–${STAIR_STEPS_MAX} 的整数`);
      setSteps(String(spec.steps));
      return;
    }
    setError('');
    update({ steps: value, stepsManual: true });
  };
  const counts = stairFlightCount(spec.form), widths = stairFlightWidths(spec), lengths = stairFlightLengths(spec, furniture.w, furniture.d);
  const metrics = stairMetrics(spec, furniture.w, furniture.d, design.height), auto = stairSteps(design.height, stairRiser(spec));
  const m = (mm: number) => meterDraft(Math.round(mm));
  // 外框是怎么来的：把相加的尺寸列出来，避免改外框和改细节时对不上。
  const box = stairBoxTerms(spec), chain = (label: string, parts: { label: string; value: number }[]) => ({
    label, text: `${parts.map(p => `${p.label} ${m(p.value)}`).join(' + ')}${parts.length > 1 ? ` = ${m(parts.reduce((a, b) => a + b.value, 0))}` : ''} m`,
  });
  const terms = [chain(spec.form === 'spiral' ? '外框' : '外框宽', box.w), ...(box.d.length ? [chain('外框深', box.d)] : [])];
  const prefix = (i: number) => (counts > 1 ? `第 ${i + 1} 跑` : '梯段');
  return <div className="stair-editor" onKeyDown={e => e.stopPropagation()}>
    <div className="stair-forms" role="radiogroup" aria-label="楼梯类别">
      {STAIR_PRESETS.map(p => { const preview = previewOf(p, furniture, spec.steps, design.height);
        return <button key={p.form} type="button" role="radio" aria-checked={p.form === spec.form}
          className="stair-form-card" onClick={() => pickForm(p.form)}>
          <svg viewBox={`${-preview.box.w / 2 - 80} ${-preview.box.d / 2 - 80} ${preview.box.w + 160} ${preview.box.d + 160}`} className="furniture-drawing" aria-hidden="true">
            <StairPlan spec={preview.stair} w={preview.box.w} d={preview.box.d} color={furniture.color} />
          </svg>
          <span>{p.name.replace('楼梯', '').trim()}</span>
        </button>; })}
    </div>
    <div className="stair-fields">
      {widths.map((value, i) => [
        <MeterField key={`w${spec.form}${i}`} label={`${prefix(i)}宽 / m`} value={value} onError={setError} onCommit={mm => setWidth(i, mm)} />,
        lengths[i] !== undefined && <MeterField key={`l${spec.form}${i}`} label={`${prefix(i)}长 / m`} value={lengths[i]} onError={setError} onCommit={mm => setLength(i, mm)} />,
      ])}
    </div>
    <div className="stair-steps-row">
      <Label className="field-label">踏步数 / 级
        <span className="stair-steps">
          <Button type="button" variant="outline" size="icon" aria-label="减少一级" disabled={spec.steps <= STAIR_STEPS_MIN}
            onClick={() => update({ steps: spec.steps - 1, stepsManual: true })}><Minus /></Button>
          <Input className="editor-control" aria-label="踏步数" type="number" step={1} value={steps}
            onChange={e => setSteps(e.target.value)} onBlur={() => commitSteps(steps)} onKeyDown={enterBlurs} />
          <Button type="button" variant="outline" size="icon" aria-label="增加一级" disabled={spec.steps >= STAIR_STEPS_MAX}
            onClick={() => update({ steps: spec.steps + 1, stepsManual: true })}><Plus /></Button>
        </span>
      </Label>
      <div className="stair-modes">
        <span className={spec.stepsManual ? 'stair-mode' : 'stair-mode is-active'}>{spec.stepsManual ? '手动' : '自动'}</span>
        {spec.stepsManual && <Button type="button" variant="ghost" size="sm" className="stair-auto" aria-label="按层高恢复自动踏步数"
          onClick={() => update({ steps: auto, stepsManual: false })}><RotateCcw size={13} />按层高算 {auto} 级</Button>}
      </div>
    </div>
    <div className="stair-fields">
      <MeterField label="踏面宽 / m" value={stairTread(spec)} onError={setError} onCommit={mm => check(mm, STAIR_TREAD_MIN, STAIR_TREAD_MAX, '踏面宽') && update({ treadDepth: mm })} />
      <MeterField label="踏步高 / m" value={stairRiser(spec)} onError={setError} onCommit={mm => check(mm, STAIR_RISER_MIN, STAIR_RISER_MAX, '踏步高') && update({ riserHeight: mm })} />
    </div>
    {counts > 1 && spec.form === 'u' && <div className="stair-fields">
      <MeterField label="梯井宽 / m" value={stairWell(spec)} onError={setError}
        onCommit={mm => check(mm, STAIR_WELL_MIN, STAIR_WELL_MAX, '梯井宽') && update({ wellGap: mm })} />
    </div>}
    <div className="stair-direction">
      <EditorSelect label="行走方向" value={spec.reverse ? 'reverse' : 'forward'}
        options={[{ value: 'forward', label: '正向 · 由此端起步' }, { value: 'reverse', label: '反向 · 由另一端起步' }]}
        onChange={value => update({ reverse: value === 'reverse' })} />
      {counts > 1 && <EditorSelect label="转向" value={spec.hand ?? 'right'}
        options={[{ value: 'right', label: '右转' }, { value: 'left', label: '左转' }]}
        onChange={value => update({ hand: value as StairSpec['hand'] })} />}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <dl className="stair-metrics">
      {terms.map(t => <div key={t.label} className="stair-box-term"><dt>{t.label}</dt><dd>{t.text}</dd></div>)}
      <div><dt>{spec.form === 'spiral' ? '踏面宽（距内侧 0.25 m）' : '实际踏面宽'}</dt><dd>{Math.round(metrics.treadDepth)} mm</dd></div>
      <div><dt>实际踏步高</dt><dd>{Math.round(metrics.riserHeight)} mm</dd></div>
      <div><dt>踏步数</dt><dd>{spec.steps} 级</dd></div>
    </dl>
    {metrics.warnings.map(text => <p key={text} className="stair-warning" role="note"><AlertTriangle size={14} />{text}</p>)}
    <p className="muted-note">
      上方「外框」由这些尺寸相加得出；在「尺寸与位置」里直接改外框，也会按外框反推这些尺寸，两边始终一致。
      {spec.form === 'u' && '梯井是 U 型两跑梯段之间的竖向空档，住宅常取 0.10–0.20 m；净宽大于 0.11 m 时须做防止儿童攀滑的措施。'}
      依据 GB 50096 套内楼梯：梯段宽 ≥ 0.75 m、踏面宽 ≥ 0.22 m、踏步高 ≤ 0.20 m。
    </p>
  </div>;
}
