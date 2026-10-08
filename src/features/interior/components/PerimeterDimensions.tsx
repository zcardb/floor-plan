import { formatMeters } from '../model/lengthUnits';
import { dimensionLabelOffset, type DimensionChain, type PerimeterLayout } from '../model/perimeterDimensions';

function Chain({ segments, at, sourceAt, horizontal, outward, overall }: DimensionChain) {
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
        <text className="dimension-text" x={horizontal ? center : offset} y={horizontal ? offset : center}
          transform={horizontal ? undefined : `rotate(-90 ${offset} ${center})`}
          textAnchor="middle" dominantBaseline={outward === 1 ? 'hanging' : undefined}
          fontSize={segment.fontSize} data-dimension-length={segment.end - segment.start}>
          {formatMeters(segment.end - segment.start)} m
        </text>
      </g>;
    })}
  </g>;
}
export function PerimeterDimensions({ layout }: { layout: PerimeterLayout | null }) {
  if (!layout) return null;
  return <g pointerEvents="none" aria-label="自动外围尺寸">
    {layout.chains.map((chain, index) => <Chain key={index} {...chain} />)}
  </g>;
}
