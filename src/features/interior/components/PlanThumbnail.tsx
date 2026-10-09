import { useMemo } from 'react';
import { FurnitureShape } from './FurnitureShape';
import { thumbnailBounds, wallPieces, type ThumbnailDesign, type ThumbnailSegment } from '../model/planThumbnail';
import type { TemplatePreset } from '../data/templatePresets';

const Segment = ({ s }: { s: ThumbnailSegment }) =>
  <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} strokeWidth={s.width} />;

/**
 * 户型平面缩略图：房间底色 + 家具 + 墙体（门留洞、窗画线）。
 * 内置模板、本机项目和云端保存的瘦身快照共用同一份渲染。
 */
export function PlanThumbnail({ design, label, focusRoomId }: { design: ThumbnailDesign; label: string; focusRoomId?: string }) {
  const { box, pieces } = useMemo(() => ({ box: thumbnailBounds(design, focusRoomId), pieces: wallPieces(design) }), [design, focusRoomId]);
  return <svg className="plan-thumbnail" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" aria-label={label} role="img">
    <g className="plan-thumbnail-rooms">{design.rooms.map(r => <polygon key={r.id} className={focusRoomId && r.id !== focusRoomId ? 'is-dim' : undefined} points={(r.rings[0] ?? []).map(p => p.join(',')).join(' ')} />)}</g>
    <g>{design.furniture.map(f => <g key={f.id} transform={`translate(${f.cx},${f.cy}) rotate(${f.rot})`}><FurnitureShape f={f} /></g>)}</g>
    <g className="plan-thumbnail-walls">{pieces.walls.map(s => <Segment key={s.key} s={s} />)}</g>
    <g className="plan-thumbnail-windows">{pieces.windows.map(s => <Segment key={s.key} s={s} />)}</g>
  </svg>;
}

/** 内置模板缩略图：模板方案按需生成一次。 */
export function PresetThumbnail({ preset }: { preset: TemplatePreset }) {
  const design = useMemo(() => preset.build(), [preset]);
  return <PlanThumbnail design={design} label={`${preset.name}家具布置图`} />;
}
