import { useMemo } from 'react';
import { formatMeters } from '@/lib/floor-plan/length-units';
import { enclosedRegions, isRoomSized } from '@/lib/floor-plan/room-derive';
import { separatorLength } from '@/lib/floor-plan/separators';
import type { Design, Point, Separator } from '@/lib/floor-plan/types';

const ringsPath = (rings: Point[][]) => rings.map(r => 'M' + r.map(p => p.join(',')).join('L') + 'Z').join('');

/**
 * 墙围住但不够房间大小的碎块（墙垛缝、管井）按墙体填充，不露出图纸底色；
 * 房间分隔线画成细虚线，点中可选择；选中后两端出现手柄，线身可沿法向拖动。
 */
export function PlanSeparators({ design, selectedId, scale, dragging = false }: { design: Design; selectedId?: string; scale: number; dragging?: boolean }) {
  const { walls, separators, demolished } = design;
  const scraps = useMemo(
    () => enclosedRegions({ ...design, walls, separators, demolished }).filter(r => !isRoomSized(r)),
    // 只随结构变化重算；房间、家具变化不影响碎块。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, separators, demolished],
  );
  const selected = separators?.find(s => s.id === selectedId);
  return (
    <>
      {scraps.map((rings, i) => (
        <path key={i} d={ringsPath(rings)} fill="var(--plan-wall)" fillRule="evenodd" pointerEvents="none" className="plan-scrap" />
      ))}
      {(separators ?? []).map(s => {
        const isSelected = s.id === selectedId;
        const line = { x1: s.a[0], y1: s.a[1], x2: s.b[0], y2: s.b[1] };
        return (
          <g key={s.id} data-separator={s.id} className={'plan-separator' + (isSelected ? ' is-selected' : '')}>
            <line {...line} stroke="transparent" strokeWidth={14 / scale} strokeLinecap="round" />
            <line
              {...line}
              stroke={isSelected ? 'var(--plan-selection)' : 'var(--plan-separator)'}
              strokeWidth={(isSelected ? 3 : 1.5) / scale}
              strokeDasharray={`${8 / scale} ${5 / scale}`}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {selected && <SeparatorHandles line={selected} scale={scale} dragging={dragging} />}
    </>
  );
}

/** 选中分隔线的两端手柄：视觉半径 7 px，命中半径 14 px；拖动中在线旁标注长度。 */
function SeparatorHandles({ line, scale, dragging }: { line: Separator; scale: number; dragging: boolean }) {
  const vertical = Math.abs(line.b[0] - line.a[0]) < Math.abs(line.b[1] - line.a[1]);
  const mid: Point = [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2];
  return (
    <g data-export-hide="true" className="selection-overlay">
      {dragging && (
        <text
          x={mid[0] + (vertical ? 12 / scale : 0)}
          y={mid[1] - (vertical ? 0 : 10 / scale)}
          textAnchor={vertical ? 'start' : 'middle'}
          dominantBaseline={vertical ? 'central' : 'auto'}
          fontSize={12 / scale}
          className="plan-separator-length"
          pointerEvents="none"
        >
          {formatMeters(separatorLength(line))} m
        </text>
      )}
      {(['a', 'b'] as const).map(end => (
        <g key={end} data-handle={'sep' + end} data-editor-keep-visible="handle" className={'plan-separator-handle ' + (vertical ? 'is-vertical' : 'is-horizontal')}>
          <circle cx={line[end][0]} cy={line[end][1]} r={14 / scale} fill="transparent" />
          <circle cx={line[end][0]} cy={line[end][1]} r={7 / scale} fill="var(--plan-porcelain)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
        </g>
      ))}
    </g>
  );
}
