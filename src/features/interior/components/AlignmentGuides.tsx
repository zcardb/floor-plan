import type { AlignmentGuide } from '../model/furnitureAlignment';

export function AlignmentGuides({ guides, scale }: { guides: AlignmentGuide[]; scale: number }) {
  if (!guides.length) return null;
  const pad = 12 / scale, r = 2.5 / scale;
  return (
    <g data-export-hide="true" pointerEvents="none">
      {guides.map(g => {
        const [x1, y1, x2, y2] = g.axis === 'x' ? [g.at, g.from - pad, g.at, g.to + pad] : [g.from - pad, g.at, g.to + pad, g.at];
        return (
          <g key={`${g.axis}-${g.at}`} data-alignment-guide={g.axis}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-selection)" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} />
            <circle cx={x1} cy={y1} r={r} fill="var(--plan-selection)" />
            <circle cx={x2} cy={y2} r={r} fill="var(--plan-selection)" />
          </g>
        );
      })}
    </g>
  );
}
