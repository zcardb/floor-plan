import { length, nearestOnWall } from '@/lib/floor-plan/geometry';
import { connectedWallPoly } from '@/lib/floor-plan/wall-connections';
import type { Wall } from '@/lib/floor-plan/types';
import type { WallSnap } from '../model/wall-drawing';
import { rangeSide, WallRangeDimensions } from './wall-range-dimensions';

interface Props {
  walls: Wall[];
  candidate: WallSnap | null;
  scale: number;
  connection?: WallSnap | null;
  demolished?: string[];
  /** 固定显示的提示；不传时，悬停点可连接则显示「点击连接」。 */
  label?: string;
}

/** 提示文字画在距离读数的另一侧，并朝远离墙的方向展开，不压墙身、圆点或读数。 */
export function hintPlacement(wall: Wall, point: [number, number], scale: number) {
  const [nx, ny] = rangeSide(wall);
  const sx = -nx, sy = -ny, gap = wall.thickness / 2 + 20 / scale;
  return {
    x: point[0] + sx * gap,
    y: point[1] + sy * gap,
    textAnchor: sx > 0.5 ? 'start' : sx < -0.5 ? 'end' : 'middle',
    dominantBaseline: sy > 0.5 ? 'hanging' : sy < -0.5 ? 'auto' : 'middle',
  } as const;
}

/** 悬停墙体：高亮墙身，并沿墙标出悬停点到两端的距离（选择与绘墙共用）。 */
export function WallHoverOverlay({ walls, candidate, scale, connection = candidate, demolished = [], label }: Props) {
  const wall = candidate?.target && walls.find(w => w.id === candidate.target?.wallId);
  if (!wall || !candidate || demolished.includes(wall.id)) return null;
  const [x, y] = candidate.point;
  const offset = nearestOnWall(candidate.point, wall).offset;
  const canConnect = connection?.target?.wallId === wall.id && Math.hypot(connection.point[0] - x, connection.point[1] - y) < 0.1;
  const hint = label ?? (canConnect ? '点击连接' : undefined);
  const place = hintPlacement(wall, candidate.point, scale);
  return (
    <g data-export-hide="true" pointerEvents="none">
      <polygon points={connectedWallPoly(wall, walls, demolished).map(p => p.join(',')).join(' ')} fill="var(--plan-selection-soft)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      <WallRangeDimensions wall={wall} ranges={[[0, offset], [offset, length(wall)]]} scale={scale} stagger={Math.min(offset, length(wall) - offset) * scale < 60} label="悬停点到墙两端距离" />
      <circle cx={x} cy={y} r={6 / scale} fill="var(--plan-porcelain)" stroke="var(--plan-selection)" strokeWidth={2 / scale} />
      {hint && <text data-wall-hint x={place.x} y={place.y} textAnchor={place.textAnchor} dominantBaseline={place.dominantBaseline} fontSize={12 / scale} fill="var(--plan-selection)" stroke="var(--plan-porcelain)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">{hint}</text>}
    </g>
  );
}
