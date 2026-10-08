import { length } from '../model/geometry';
import { formatMeters } from '../model/lengthUnits';
import type { Design } from '../model/types';

export function OpeningDistances({ design, openingId, scale }: { design: Design; openingId: string; scale: number }) {
  const opening = design.openings.find(o => o.id === openingId);
  const wall = opening && design.walls.find(w => w.id === opening.wallId);
  if (!opening || !wall) return null;
  const total = length(wall);
  if (!total || scale <= 0) return null;
  const ux = (wall.b[0] - wall.a[0]) / total, uy = (wall.b[1] - wall.a[1]) / total;
  const nx = -uy, ny = ux;
  const gap = wall.thickness / 2 + 24 / scale;
  const edges = [opening.offset - opening.width / 2, opening.offset + opening.width / 2];
  const ranges = [[0, edges[0]], [edges[1], total]];
  const at = (offset: number, normal = gap) => [wall.a[0] + ux * offset + nx * normal, wall.a[1] + uy * offset + ny * normal];
  // Keep labels horizontal and on separate rows when the opening is small on screen.
  const stagger = opening.width * scale < 120;
  return <g data-export-hide="true" pointerEvents="none" aria-label="门窗两侧墙端距离">
    {ranges.map(([start, end], index) => {
      const a = at(start), b = at(end), mid = at((start + end) / 2, gap + 12 / scale);
      if (stagger) mid[1] += index * 18 / scale;
      return <g key={index} data-opening-distance={Math.max(0, end - start)}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--plan-selection)" strokeWidth={1 / scale} />
        {[start, end].map((offset, i) => {
          const p = at(offset, gap - 4 / scale), q = at(offset, gap + 4 / scale);
          return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--plan-selection)" strokeWidth={1 / scale} />;
        })}
        <text x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="middle" fontSize={12 / scale}
          fill="var(--plan-selection)" stroke="var(--plan-porcelain)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">
          {formatMeters(Math.max(0, end - start))} m
        </text>
      </g>;
    })}
  </g>;
}
