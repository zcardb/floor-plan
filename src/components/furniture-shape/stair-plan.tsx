import type { Point, StairSpec } from '@/lib/floor-plan/types';
import { stairLayout } from '@/lib/floor-plan/stairs';

const pathOf = (points: Point[], closed = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + (closed ? 'Z' : '');

/** 楼梯平面图样（GB/T 50104）：踏步线、平台、梯井、行走线 + 箭头、起步点、「上」字、折断线。局部坐标以外框中心为原点。 */
export function StairPlan({ spec, w, d, color }: { spec: StairSpec; w: number; d: number; color: string }) {
  const layout = stairLayout(spec, w, d), { outline } = layout;
  return <g aria-label="楼梯平面示意" data-stair-form={spec.form}>
    {outline.kind === 'rect' ? <rect x={-w / 2} y={-d / 2} width={Math.max(1, w)} height={Math.max(1, d)} fill={color} />
      : outline.kind === 'circle' ? <circle cx={0} cy={0} r={outline.r} fill={color} />
        : <path d={pathOf(outline.points, true)} fill={color} />}
    {layout.column !== undefined && <circle cx={0} cy={0} r={layout.column} fill="var(--plan-porcelain)" />}
    {layout.lines.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}
    <path d={pathOf(layout.walk)} fill="none" />
    <path d={pathOf(layout.arrow)} fill="none" />
    <path d={pathOf(layout.breakLine)} fill="none" />
    <circle cx={layout.start[0]} cy={layout.start[1]} r={layout.startRadius} fill="none" />
    <text className="stair-label" x={layout.label[0]} y={layout.label[1]} fontSize={layout.labelSize} textAnchor="middle" dominantBaseline="central">上</text>
  </g>;
}
