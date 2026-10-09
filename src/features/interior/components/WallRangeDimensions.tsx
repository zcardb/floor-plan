import { length } from '../model/geometry';
import { formatMeters } from '../model/lengthUnits';
import type { Wall } from '../model/types';

/** 尺寸读数所在一侧的单位法向（墙方向逆时针转 90°）；悬停提示画在相反一侧，避免互相覆盖。 */
export function rangeSide(wall: Wall): [number, number] {
  const total = length(wall) || 1;
  return [-(wall.b[1] - wall.a[1]) / total, (wall.b[0] - wall.a[0]) / total];
}

/** 沿墙一侧绘制若干段尺寸标注（标注线 + 端点刻度 + 米制读数），供门窗净距与墙体悬停测距共用。 */
export function WallRangeDimensions({ wall, ranges, scale, stagger = false, label, keepVisible = false }: {
  wall: Wall;
  ranges: [number, number][];
  scale: number;
  /** 屏幕上空间不足时，读数错行显示避免重叠。 */
  stagger?: boolean;
  label: string;
  /** 浮动编辑栏摆放时避开这组标注。 */
  keepVisible?: boolean;
}) {
  const total = length(wall);
  if (!total || scale <= 0) return null;
  const ux = (wall.b[0] - wall.a[0]) / total, uy = (wall.b[1] - wall.a[1]) / total;
  const [nx, ny] = rangeSide(wall);
  const gap = wall.thickness / 2 + 24 / scale;
  const at = (offset: number, normal = gap) => [wall.a[0] + ux * offset + nx * normal, wall.a[1] + uy * offset + ny * normal];
  return <g data-export-hide="true" pointerEvents="none" aria-label={label} data-editor-keep-visible={keepVisible || undefined}>
    {ranges.map(([start, end], index) => {
      const a = at(start), b = at(end), mid = at((start + end) / 2, gap + 12 / scale);
      if (stagger) mid[1] += index * 18 / scale;
      return <g key={index} data-range-distance={Math.max(0, end - start)}>
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
