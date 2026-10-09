import { length } from '../model/geometry';
import { formatMeters } from '../model/lengthUnits';
import { placementGaps, type WallPlacement } from '../model/wallPlacement';

/**
 * 贴墙对象（门窗 / 贴墙家具）的位置示意图：画出所在墙段与对象占位，
 * 用序号 1 / 2 标出对象到墙两端的两段净距（与右侧输入框对应）。竖向墙按竖向展示。
 */
export function WallPlacementDiagram({ placement, active }: { placement: WallPlacement; active?: 0 | 1 | null }) {
  const total = Math.max(length(placement.wall), 1);
  const [g0, g1] = placementGaps(placement);
  const size = Math.max(0, total - g0 - g1);
  const vertical = placement.names[0] === '上';
  const band = total * 0.05, unit = total / 26, pad = total * 0.1;
  // s：沿墙坐标（0 为第 1 端）；c：垂直墙方向的坐标。
  const at = (s: number, c: number): [number, number] => vertical ? [c, s] : [s, c];
  const line = (s0: number, s1: number, c: number) => {
    const [x1, y1] = at(s0, c), [x2, y2] = at(s1, c);
    return { x1, y1, x2, y2 };
  };
  const dimC = band * 2.2;
  const spans: [number, number][] = [[0, g0], [g0 + size, total]];
  const objA = at(g0, -band * 0.8), objB = at(g0 + size, band * 0.8);
  const viewBox = vertical
    ? `${-band - pad} ${-pad} ${band + dimC + unit * 2 + pad * 2} ${total + pad * 2}`
    : `${-pad} ${-band - pad} ${total + pad * 2} ${band + dimC + unit * 2 + pad * 2}`;
  return <svg className="wall-placement-diagram" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={`墙上位置示意：距${placement.names[0]}端 ${formatMeters(g0)} m，距${placement.names[1]}端 ${formatMeters(g1)} m`}>
    <line className="wall-placement-wall" {...line(0, total, 0)} strokeWidth={band} />
    <rect className="wall-placement-object" x={Math.min(objA[0], objB[0])} y={Math.min(objA[1], objB[1])}
      width={Math.abs(objB[0] - objA[0])} height={Math.abs(objB[1] - objA[1])} />
    {spans.map(([s0, s1], index) => {
      const mid = at((s0 + s1) / 2, dimC + unit * 1.6);
      return <g key={index} className={'wall-placement-span' + (active === index ? ' is-active' : '')}>
        <line className="wall-placement-dim" {...line(s0, s1, dimC)} />
        {[s0, s1].map((s, i) => {
          const [x1, y1] = at(s, dimC - unit * 0.5), [x2, y2] = at(s, dimC + unit * 0.5);
          return <line key={i} className="wall-placement-dim" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        <g className="wall-placement-marker">
          <circle cx={mid[0]} cy={mid[1]} r={unit * 0.95} />
          <text x={mid[0]} y={mid[1]} fontSize={unit * 1.1} textAnchor="middle" dominantBaseline="central">{index + 1}</text>
        </g>
      </g>;
    })}
  </svg>;
}
