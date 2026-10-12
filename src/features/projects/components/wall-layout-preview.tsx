import { useMemo } from 'react';
import { connectedWallPoly } from '@/lib/floor-plan/wall-connections';
import { formatMeters } from '@/lib/floor-plan/length-units';
import type { Design } from '@/lib/floor-plan/types';

const PAD_RATIO = 0.08;

/** 新建项目弹窗的户型预览：只画墙体（不画门窗、家具）；传入 size 时在外框标注长、宽（空白户型与模板都显示）。 */
export function WallLayoutPreview({ design, size, label }: {
  design: Pick<Design, 'walls' | 'demolished'>;
  size?: { width: number; depth: number };
  label: string;
}) {
  const plan = useMemo(() => {
    const walls = design.walls.filter(w => !design.demolished.includes(w.id));
    const polygons = walls.map(w => ({ key: w.id, points: connectedWallPoly(w, walls, design.demolished) }));
    const all = polygons.flatMap(p => p.points);
    if (!all.length) return null;
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    // 尺寸标注在上方和左侧，多留一点边距给文字。
    const pad = Math.max(w, h, 1) * PAD_RATIO * (size ? 2 : 1);
    return {
      box: { x, y, w, h },
      viewBox: `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`,
      font: Math.max(w, h, 1) * 0.05,
      walls: polygons.map(p => ({ key: p.key, points: p.points.map(q => q.join(',')).join(' ') })),
    };
  }, [design, size]);
  if (!plan) return <div className="wall-layout-preview is-empty" role="img" aria-label={label}>暂无墙体</div>;
  const { box, font } = plan;
  return <svg className="wall-layout-preview" viewBox={plan.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
    <g className="wall-layout-preview-walls">{plan.walls.map(w => <polygon key={w.key} points={w.points} />)}</g>
    {size && <g className="wall-layout-preview-dims" fontSize={font}>
      <text x={box.x + box.w / 2} y={box.y - font * 0.8} textAnchor="middle" data-dimension="width">长 {formatMeters(size.width)} m</text>
      <text x={box.x - font * 0.8} y={box.y + box.h / 2} textAnchor="middle" data-dimension="depth"
        transform={`rotate(-90 ${box.x - font * 0.8} ${box.y + box.h / 2})`}>宽 {formatMeters(size.depth)} m</text>
    </g>}
  </svg>;
}
