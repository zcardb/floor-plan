import { formatMeters } from '../model/lengthUnits';
import { dimensionLabelOffset, type DimensionSegment, type PerimeterLayout } from '../model/perimeterDimensions';

function DimensionChain({ segments, at, horizontal, outward }: {
  segments: DimensionSegment[]; at: number; horizontal: boolean; outward: -1 | 1;
}) {
  if (!segments.length) return null;
  const start = segments[0].start, end = segments[segments.length - 1].end;
  const ticks = [start, ...segments.map(segment => segment.end)];
  return <g className="dimension" data-dimension-axis={horizontal ? 'x' : 'y'}>
    {horizontal ? <line x1={start} y1={at} x2={end} y2={at} /> : <line x1={at} y1={start} x2={at} y2={end} />}
    {ticks.map(pos => <path key={pos} d={horizontal
      ? `M${pos} ${at - 100}V${at + 100}M${pos - 60} ${at + 60}L${pos + 60} ${at - 60}`
      : `M${at - 100} ${pos}H${at + 100}M${at - 60} ${pos + 60}L${at + 60} ${pos - 60}`} />)}
    {segments.map(segment => {
      const center = (segment.start + segment.end) / 2;
      const offset = at + outward * dimensionLabelOffset(segment);
      return <text key={`${segment.start}:${segment.end}`} className="dimension-text"
        x={horizontal ? center : offset} y={horizontal ? offset : center}
        transform={horizontal ? undefined : `rotate(-90 ${offset} ${center})`}
        textAnchor="middle" dominantBaseline={outward === 1 ? 'hanging' : undefined}
        fontSize={segment.fontSize} data-dimension-length={segment.end - segment.start}>
        {formatMeters(segment.end - segment.start)} m
      </text>;
    })}
  </g>;
}

export function PerimeterDimensions({ layout }: { layout: PerimeterLayout | null }) {
  if (!layout) return null;
  return <g pointerEvents="none" aria-label="自动外围尺寸">
    <DimensionChain segments={layout.horizontal} at={layout.top} horizontal outward={-1} />
    <DimensionChain segments={layout.horizontal} at={layout.bottom} horizontal outward={1} />
    <DimensionChain segments={layout.vertical} at={layout.left} horizontal={false} outward={-1} />
    <DimensionChain segments={layout.vertical} at={layout.right} horizontal={false} outward={1} />
  </g>;
}
