import { length, nearestOnWall } from '../model/geometry';
import { connectedWallPoly } from '../model/wallConnections';
import { formatMeters } from '../model/lengthUnits';
import type { Wall } from '../model/types';
import type { WallSnap } from '../model/wallDrawing';

interface Props {
  walls: Wall[];
  candidate: WallSnap | null;
  scale: number;
  connection?: WallSnap | null;
  demolished?: string[];
}

export function WallHoverOverlay({ walls, candidate, scale, connection = candidate, demolished = [] }: Props) {
  const wall = candidate?.target && walls.find(w => w.id === candidate.target?.wallId);
  if (!wall || !candidate) return null;
  const [x, y] = candidate.point;
  const offset = nearestOnWall(candidate.point, wall).offset;
  const meters = formatMeters(Math.min(offset, length(wall) - offset));
  const canConnect = connection?.target?.wallId === wall.id && Math.hypot(connection.point[0] - x, connection.point[1] - y) < 0.1;
  return (
    <g data-export-hide="true" pointerEvents="none">
      <polygon points={connectedWallPoly(wall, walls, demolished).map(p => p.join(',')).join(' ')} fill="var(--plan-selection-soft)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      <circle cx={x} cy={y} r={6 / scale} fill="var(--plan-porcelain)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      <text x={x + 12 / scale} y={y - 28 / scale} fontSize={12 / scale} fill="var(--plan-selection)" stroke="var(--plan-porcelain)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">距近端 {meters} 米</text>
      {canConnect && <text x={x + 12 / scale} y={y - 12 / scale} fontSize={12 / scale} fill="var(--plan-selection)" stroke="var(--plan-porcelain)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">点击连接</text>}
    </g>
  );
}
