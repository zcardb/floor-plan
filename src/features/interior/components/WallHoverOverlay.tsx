import { length, nearestOnWall } from '../model/geometry';
import { connectedWallPoly } from '../model/wallConnections';
import type { Wall } from '../model/types';
import type { WallSnap } from '../model/wallDrawing';
import { WallRangeDimensions } from './WallRangeDimensions';

interface Props {
  walls: Wall[];
  candidate: WallSnap | null;
  scale: number;
  connection?: WallSnap | null;
  demolished?: string[];
}

/** 悬停墙体：高亮墙身，并沿墙标出悬停点到两端的距离（选择与绘墙共用）。 */
export function WallHoverOverlay({ walls, candidate, scale, connection = candidate, demolished = [] }: Props) {
  const wall = candidate?.target && walls.find(w => w.id === candidate.target?.wallId);
  if (!wall || !candidate || demolished.includes(wall.id)) return null;
  const [x, y] = candidate.point;
  const offset = nearestOnWall(candidate.point, wall).offset;
  const canConnect = connection?.target?.wallId === wall.id && Math.hypot(connection.point[0] - x, connection.point[1] - y) < 0.1;
  return (
    <g data-export-hide="true" pointerEvents="none">
      <polygon points={connectedWallPoly(wall, walls, demolished).map(p => p.join(',')).join(' ')} fill="var(--plan-selection-soft)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      <WallRangeDimensions wall={wall} ranges={[[0, offset], [offset, length(wall)]]} scale={scale} stagger={Math.min(offset, length(wall) - offset) * scale < 60} label="悬停点到墙两端距离" />
      <circle cx={x} cy={y} r={6 / scale} fill="var(--plan-porcelain)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      {canConnect && <text x={x + 12 / scale} y={y - 12 / scale} fontSize={12 / scale} fill="var(--plan-selection)" stroke="var(--plan-porcelain)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">点击连接</text>}
    </g>
  );
}
