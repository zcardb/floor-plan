import { useEffect, useState } from 'react';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import {
  STAIR_FLIGHT_MAX, STAIR_FLIGHT_MIN, STAIR_PRESETS, STAIR_STEPS_MAX, STAIR_STEPS_MIN,
  applyStairForm, stairMetrics, stairSpec,
} from '../model/stairs';
import type { Design, Furniture, StairForm, StairSpec } from '../model/types';
import { StairPlan } from './StairPlan';

type Change = (fn: (d: Design) => Design) => void;
const updateFurniture = (change: Change, id: string, fn: (f: Furniture) => Furniture) =>
  change(d => ({ ...d, furniture: d.furniture.map(f => (f.id === id ? fn(f) : f)) }));

/** 楼梯专属编辑：类别、梯段宽、踏步数，以及按 GB 50096 套内楼梯推导的踏步尺寸提示。 */
export function StairEditor({ design, furniture, change }: { design: Design; furniture: Furniture; change: Change }) {
  const spec = stairSpec(furniture);
  const [width, setWidth] = useState(meterDraft(spec.flightWidth)), [steps, setSteps] = useState(String(spec.steps));
  const [error, setError] = useState('');
  useEffect(() => setWidth(meterDraft(spec.flightWidth)), [spec.flightWidth]);
  useEffect(() => setSteps(String(spec.steps)), [spec.steps]);
  const patch = (next: Partial<StairSpec>) => updateFurniture(change, furniture.id, f => ({ ...f, stair: { ...stairSpec(f), ...next } }));
  const pickForm = (form: StairForm) => { setError(''); if (form !== spec.form) updateFurniture(change, furniture.id, f => applyStairForm(f, form)); };
  const commitWidth = () => {
    const value = parseMeterDraft(width);
    if (!Number.isFinite(value) || value < STAIR_FLIGHT_MIN || value > STAIR_FLIGHT_MAX) {
      setError(`梯段宽需在 ${meterDraft(STAIR_FLIGHT_MIN)}–${meterDraft(STAIR_FLIGHT_MAX)} m 之间`);
      setWidth(meterDraft(spec.flightWidth));
      return;
    }
    setError('');
    if (value !== spec.flightWidth) patch({ flightWidth: value });
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
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } };
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
      <Label className="field-label">梯段宽 / m
        <Input className="editor-control" aria-label="梯段宽 / m" type="number" step={0.01} value={width}
          onChange={e => setWidth(e.target.value)} onBlur={commitWidth} onKeyDown={enter} />
      </Label>
      <Label className="field-label">踏步数 / 级
        <span className="stair-steps">
          <Button type="button" variant="outline" size="icon" aria-label="减少一级" disabled={spec.steps <= STAIR_STEPS_MIN}
            onClick={() => commitSteps(String(spec.steps - 1))}><Minus /></Button>
          <Input className="editor-control" aria-label="踏步数" type="number" step={1} value={steps}
            onChange={e => setSteps(e.target.value)} onBlur={() => commitSteps(steps)} onKeyDown={enter} />
          <Button type="button" variant="outline" size="icon" aria-label="增加一级" disabled={spec.steps >= STAIR_STEPS_MAX}
            onClick={() => commitSteps(String(spec.steps + 1))}><Plus /></Button>
        </span>
      </Label>
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
