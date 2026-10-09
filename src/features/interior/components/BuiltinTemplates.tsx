import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { TEMPLATE_PRESETS } from '../data/templates';
import { FurnitureShape } from './FurnitureShape';
const polygon = (points: [number, number][]) => points.map(p => p.join(',')).join(' ');
import type { TemplatePreset } from '../data/templatePresets';

export function TemplateThumbnail({ preset }: { preset: TemplatePreset }) {
  const design = useMemo(() => preset.build(), [preset]);
  return <svg className="template-thumbnail" viewBox={`-350 -350 ${design.width + 700} ${design.depth + 700}`} aria-label={`${preset.name}家具布置图`} role="img">
    <g className="template-map-rooms">{design.rooms.map(r => <polygon key={r.id} points={polygon(r.rings[0])} />)}</g>
    <g>{design.furniture.map(f => <g key={f.id} transform={`translate(${f.cx},${f.cy}) rotate(${f.rot})`}><FurnitureShape f={f} /></g>)}</g>
    <g className="template-map-walls">{design.walls.filter(w => !design.openings.some(o => o.wallId === w.id)).map(w => <line key={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} strokeWidth={w.thickness} />)}</g>
  </svg>;
}

export function BuiltinTemplates({ pending, onPreview, onCreate }: { pending: boolean; onPreview: (id: string) => void; onCreate: (id: string) => void }) {
  return <section className="builtin-templates" aria-labelledby="builtin-heading">
    <div className="builtin-heading"><h2 id="builtin-heading">内置户型模板</h2><p>已布置家具 · 原模板只读 · 新建后自由编辑</p></div>
    <div className="cms-project-grid">{TEMPLATE_PRESETS.map(p => <article key={p.id} className="builtin-template-card">
      <button className="template-preview-button" disabled={pending} onClick={() => onPreview(p.id)} aria-label={`预览 ${p.name}`}><TemplateThumbnail preset={p} /></button>
      <div className="template-card-content"><span className="template-badge">内置模板</span><h3>{p.name}</h3><p>{p.description}</p><small>室内轮廓约 {p.area}㎡ · {p.layout}</small>
      <div className="template-card-actions"><Button variant="outline" size="sm" disabled={pending} onClick={() => onPreview(p.id)}>只读预览</Button><Button size="sm" disabled={pending} onClick={() => onCreate(p.id)}>用此模板新建</Button></div></div>
    </article>)}</div>
  </section>;
}
