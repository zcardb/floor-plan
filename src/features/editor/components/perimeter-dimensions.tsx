import { formatMeters } from '@/lib/floor-plan/length-units';
import { dimensionLabelOffset, type DimensionChain, type DimensionSegment, type PerimeterLayout } from '@/lib/floor-plan/perimeter-dimensions';
import type { DimensionBinding } from '@/lib/floor-plan/dimension-binding';
interface EditProps { onSelect?: (segment: DimensionSegment) => void; selected?: DimensionBinding; }

function Chain({ segments, at, sourceAt, horizontal, outward, overall, onSelect, selected }: DimensionChain & EditProps) {
  if (!segments.length) return null;
  const start = segments[0].start, end = segments[segments.length - 1].end;
  const ticks = [start, ...segments.map(segment => segment.end)];
  return <g className="dimension" data-dimension-axis={horizontal ? 'x' : 'y'} data-dimension-overall={overall || undefined}>
    {horizontal ? <line x1={start} y1={at} x2={end} y2={at} /> : <line x1={at} y1={start} x2={at} y2={end} />}
    {ticks.map(pos => <path key={pos} d={horizontal
      ? `M${pos} ${sourceAt + outward * 35}V${at + outward * 120}M${pos - 60} ${at + 60}L${pos + 60} ${at - 60}`
      : `M${sourceAt + outward * 35} ${pos}H${at + outward * 120}M${at - 60} ${pos + 60}L${at + 60} ${pos - 60}`} />)}
    {segments.map(segment => {
      const center = (segment.start + segment.end) / 2;
      const offset = at + outward * dimensionLabelOffset(segment);
      return <g key={`${segment.start}:${segment.end}`}>
        {segment.lane > 0 && (horizontal
          ? <line x1={center} y1={at} x2={center} y2={offset - outward * 35} />
          : <line x1={at} y1={center} x2={offset - outward * 35} y2={center} />)}
        {onSelect && <g data-export-hide="true" pointerEvents="all" role="button" tabIndex={0}
          aria-label={`${formatMeters(segment.end - segment.start)}米${segment.binding ? '净距，点击编辑' : '只读尺寸'}`}
          className={segment.binding ? 'dimension-hit editable' : 'dimension-hit readonly'}
          onPointerDown={e => { e.stopPropagation(); e.preventDefault(); onSelect(segment); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onSelect(segment); } }}>
          <rect x={horizontal ? center - Math.max(220, segment.fontSize * 2.5) : offset - 180}
            y={horizontal ? offset - 200 : center - Math.max(220, segment.fontSize * 2.5)}
            width={horizontal ? Math.max(440, segment.fontSize * 5) : 360}
            height={horizontal ? 360 : Math.max(440, segment.fontSize * 5)} />
        </g>}
        <text className={`dimension-text${selected && segment.binding && selected.axis === segment.binding.axis && selected.start === segment.start && selected.end === segment.end ? ' dimension-selected' : ''}`} x={horizontal ? center : offset} y={horizontal ? offset : center}
          transform={horizontal ? undefined : `rotate(-90 ${offset} ${center})`}
          textAnchor="middle" dominantBaseline={outward === 1 ? 'hanging' : undefined}
          fontSize={segment.fontSize} data-dimension-length={segment.end - segment.start}>
          {formatMeters(segment.end - segment.start)} m
        </text>
      </g>;
    })}
  </g>;
}
export function PerimeterDimensions({ layout, onSelect, selected }: { layout: PerimeterLayout | null } & EditProps) {
  if (!layout) return null;
  return <g pointerEvents="none" aria-label="自动外围尺寸">
    {layout.chains.map((chain, index) => <Chain key={index} {...chain} onSelect={onSelect} selected={selected} />)}
  </g>;
}
