import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FurnitureShape } from './FurnitureShape';
import type { TemplatePreset } from '../data/templatePresets';

const polygon = (points: [number, number][]) => points.map(p => p.join(',')).join(' ');

export function TemplateThumbnail({ preset }: { preset: TemplatePreset }) {
  const design = useMemo(() => preset.build(), [preset]);
  return <svg className="template-thumbnail" viewBox={`-350 -350 ${design.width + 700} ${design.depth + 700}`} aria-label={`${preset.name}家具布置图`} role="img">
    <g className="template-map-rooms">{design.rooms.map(r => <polygon key={r.id} points={polygon(r.rings[0])} />)}</g>
    <g>{design.furniture.map(f => <g key={f.id} transform={`translate(${f.cx},${f.cy}) rotate(${f.rot})`}><FurnitureShape f={f} /></g>)}</g>
    <g className="template-map-walls">{design.walls.filter(w => !design.openings.some(o => o.wallId === w.id)).map(w => <line key={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} strokeWidth={w.thickness} />)}</g>
  </svg>;
}

/** 内置户型模板卡片：与「我的项目」卡片同处一个网格，原模板只读，可预览或以此新建。 */
export function BuiltinTemplateCard({ preset, pending, onPreview, onCreate }: { preset: TemplatePreset; pending: boolean; onPreview: () => void; onCreate: () => void }) {
  return <article className="builtin-template-card">
    <button type="button" className="template-preview-button" disabled={pending} onClick={onPreview} aria-label={`预览 ${preset.name}`}>
      <TemplateThumbnail preset={preset} />
      <span className="cms-item-badge">内置</span>
    </button>
    <div className="template-card-content">
      <h2>{preset.name}</h2>
      <p>{preset.description}</p>
      <small>室内约 {preset.area}㎡ · {preset.layout}</small>
      <div className="template-card-actions">
        <Button variant="outline" size="sm" disabled={pending} onClick={onPreview}>只读预览</Button>
        <Button size="sm" disabled={pending} onClick={onCreate}>用此模板新建</Button>
      </div>
    </div>
  </article>;
}
