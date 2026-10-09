import { formatMeters } from '../model/lengthUnits';
import type { RoomSide } from '../model/roomSides';

const NORMAL: Record<RoomSide['facing'], [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0], slant: [0, 0] };

/**
 * 房间外轮廓示意图。labels="index" 在每条边外侧画序号徽标（与输入框对应），
 * labels="length" 直接标注每条边的长度（只读展示）。
 */
export function RoomSidesDiagram({ sides, labels, active, onPick, className }: {
  sides: RoomSide[];
  labels: 'index' | 'length';
  active?: number | null;
  onPick?: (index: number) => void;
  className?: string;
}) {
  if (!sides.length) return null;
  const xs = sides.map(side => side.a[0]), ys = sides.map(side => side.a[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * (labels === 'length' ? 0.2 : 0.16), unit = span / 26;
  const hit = span * 0.05;
  return <svg className={'room-sides-diagram ' + (className ?? '')} preserveAspectRatio="xMidYMid meet"
    viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
    role="img" aria-label={`房间轮廓示意，共 ${sides.length} 条边`}>
    <polygon className="room-sides-shape" points={sides.map(side => side.a.join(',')).join(' ')} />
    {sides.map(side => {
      const on = active === side.index;
      const normal = NORMAL[side.facing];
      const mid: [number, number] = [(side.a[0] + side.b[0]) / 2, (side.a[1] + side.b[1]) / 2];
      const label: [number, number] = [mid[0] + normal[0] * pad * 0.5, mid[1] + normal[1] * pad * 0.5];
      const vertical = side.axis === 1;
      const pick = onPick && ((event: React.PointerEvent) => { event.preventDefault(); onPick(side.index); });
      return <g key={side.index} className={'room-sides-side' + (on ? ' is-active' : '') + (side.reason ? ' is-locked' : '') + (onPick ? ' is-pickable' : '')}
        onPointerDown={pick}>
        {onPick && <line className="room-sides-hit" x1={side.a[0]} y1={side.a[1]} x2={side.b[0]} y2={side.b[1]} strokeWidth={hit} />}
        <line className="room-sides-edge" x1={side.a[0]} y1={side.a[1]} x2={side.b[0]} y2={side.b[1]} />
        {labels === 'index'
          ? <g className="room-sides-marker">
            <circle cx={label[0]} cy={label[1]} r={unit * 0.95} />
            <text x={label[0]} y={label[1]} fontSize={unit * 1.1} textAnchor="middle" dominantBaseline="central">{side.index + 1}</text>
          </g>
          : <text className="room-sides-length" x={label[0]} y={label[1]} fontSize={unit * 0.95} textAnchor="middle" dominantBaseline="central"
            strokeWidth={unit * 0.35} transform={vertical ? `rotate(-90 ${label[0]} ${label[1]})` : undefined}>
            {formatMeters(side.length)}
          </text>}
      </g>;
    })}
  </svg>;
}
