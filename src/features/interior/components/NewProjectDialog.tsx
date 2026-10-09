import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BLANK_SIZE_LIMITS, DEFAULT_BLANK_SIZE, blankDesign, presetById, TEMPLATE_PRESETS, type BlankSize } from '../data/templates';
import { formatMeters, meterDraft, parseMeterDraft } from '../model/lengthUnits';
import { WallLayoutPreview } from './WallLayoutPreview';

export interface NewProjectInput { name: string; template: string; size?: BlankSize }

const inRange = (mm: number) => Number.isFinite(mm) && mm >= BLANK_SIZE_LIMITS.min && mm <= BLANK_SIZE_LIMITS.max;
const RANGE_HINT = `长、宽需在 ${formatMeters(BLANK_SIZE_LIMITS.min)}–${formatMeters(BLANK_SIZE_LIMITS.max)} m 之间`;

/** 新建项目：名称 + 户型模板；空白户型可填长宽，底部实时预览墙体布局。 */
export function NewProjectDialog({ open, pending, onClose, onSubmit }: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: NewProjectInput) => void;
}) {
  return <Dialog open={open} onOpenChange={v => { if (!v && !pending) onClose(); }}>
    <DialogContent className="new-project-dialog">
      <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader>
      {/* 每次打开都从默认值开始。 */}
      {open && <NewProjectForm pending={pending} onSubmit={onSubmit} />}
    </DialogContent>
  </Dialog>;
}

export function NewProjectForm({ pending, onSubmit }: { pending: boolean; onSubmit: (input: NewProjectInput) => void }) {
  const [name, setName] = useState(''), [template, setTemplate] = useState('blank');
  const [width, setWidth] = useState(meterDraft(DEFAULT_BLANK_SIZE.width)), [depth, setDepth] = useState(meterDraft(DEFAULT_BLANK_SIZE.depth));
  const blank = template === 'blank';
  const size = useMemo(() => ({ width: parseMeterDraft(width), depth: parseMeterDraft(depth) }), [width, depth]);
  const sizeValid = inRange(size.width) && inRange(size.depth);
  const preset = blank ? undefined : presetById(template);
  const preview = useMemo(() => {
    if (!blank) return preset?.build() ?? null;
    return sizeValid ? blankDesign(size) : null;
  }, [blank, preset, size, sizeValid]);
  const summary = blank
    ? (sizeValid ? `${formatMeters(size.width)} × ${formatMeters(size.depth)} m · ${(size.width * size.depth / 1e6).toFixed(2)} m²` : RANGE_HINT)
    : preset ? `${preset.layout} · ${preset.area} m²` : '';
  const canSubmit = !!name.trim() && (!blank || sizeValid);
  return <form className="cms-form" onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit({ name, template, ...(blank ? { size } : {}) }); }}>
    <fieldset className="contents" disabled={pending}>
      <div className="cms-field"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="cms-field"><Label htmlFor="project-template">户型模板</Label>
        <Select value={template} onValueChange={setTemplate} disabled={pending}>
          <SelectTrigger id="project-template"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="blank">空白户型</SelectItem>{TEMPLATE_PRESETS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {blank && <div className="new-project-size">
        <div className="cms-field"><Label htmlFor="project-width">长 / m</Label><Input id="project-width" type="number" inputMode="decimal" step={0.01} min={BLANK_SIZE_LIMITS.min / 1000} max={BLANK_SIZE_LIMITS.max / 1000} aria-invalid={!inRange(size.width)} value={width} onChange={e => setWidth(e.target.value)} /></div>
        <div className="cms-field"><Label htmlFor="project-depth">宽 / m</Label><Input id="project-depth" type="number" inputMode="decimal" step={0.01} min={BLANK_SIZE_LIMITS.min / 1000} max={BLANK_SIZE_LIMITS.max / 1000} aria-invalid={!inRange(size.depth)} value={depth} onChange={e => setDepth(e.target.value)} /></div>
      </div>}
      <figure className="new-project-preview">
        {preview
          ? <WallLayoutPreview design={preview} size={blank ? size : undefined} label={blank ? '空白户型墙体预览' : `${preset?.name ?? ''}墙体预览`} />
          : <div className="wall-layout-preview is-empty">输入有效长宽后显示预览</div>}
        <figcaption className={blank && !sizeValid ? 'is-error' : undefined} role={blank && !sizeValid ? 'alert' : undefined}>{summary}</figcaption>
      </figure>
    </fieldset>
    <Button loading={pending} disabled={!canSubmit}>{pending ? '正在保存…' : '确认保存'}</Button>
  </form>;
}
