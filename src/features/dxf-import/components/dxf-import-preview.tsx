import { useMemo } from 'react';
import { length } from '@/lib/floor-plan/geometry';
import { connectedWallPoly } from '@/lib/floor-plan/wall-connections';
import { unitMm, type DxfSource, type DxfUnit } from '../model/external-dxf/dxf-source';
import { toPlan, type LayerRole, type Recognition } from '../model/external-dxf/recognize';
import { boundsOf } from '../model/external-dxf/vector';
import type { Point } from '@/lib/floor-plan/types';

const pointsText = (points: Point[]) => points.map(p => p.join(',')).join(' ');

/** 左侧预览：底下是图纸原线（浅色），上面叠识别出的房间、墙体和门窗。 */
export function DxfImportPreview({ source, roles, unit, result }: {
  source: DxfSource; roles: Record<string, LayerRole>; unit: DxfUnit; result: Recognition | null;
}) {
  const sheet = useMemo(() => {
    const mm = unitMm(unit);
    const shown = source.segments.filter(s => (roles[s.layer] ?? 'ignore') !== 'ignore');
    const lines = (shown.length ? shown : source.segments).map(s => [toPlan(s.a, mm), toPlan(s.b, mm)] as [Point, Point]);
    const box = boundsOf(lines.flat()), pad = Math.max(box.x2 - box.x, box.y2 - box.y, 1) * 0.06;
    return {
      path: lines.map(([a, b]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`).join(''),
      viewBox: `${box.x - pad} ${box.y - pad} ${box.x2 - box.x + pad * 2} ${box.y2 - box.y + pad * 2}`,
    };
  }, [source, roles, unit]);
  const plan = useMemo(() => {
    if (!result) return null;
    const { design } = result;
    return {
      rooms: design.rooms.flatMap(r => r.rings.map((ring, i) => ({ key: r.id + ':' + i, points: pointsText(ring) }))),
      walls: design.walls.map(w => ({ key: w.id, points: pointsText(connectedWallPoly(w, design.walls)) })),
      openings: design.openings.flatMap(o => {
        const wall = design.walls.find(w => w.id === o.wallId);
        if (!wall) return [];
        const L = length(wall), ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L, h = wall.thickness / 2 + 20;
        const at = (x: number, y: number): Point => [wall.a[0] + ux * (o.offset + x) - uy * y, wall.a[1] + uy * (o.offset + x) + ux * y];
        return [{ key: o.id, kind: o.kind, points: pointsText([at(-o.width / 2, -h), at(o.width / 2, -h), at(o.width / 2, h), at(-o.width / 2, h)]) }];
      }),
    };
  }, [result]);
  return <svg className="dxf-import-map" viewBox={sheet.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={result ? '识别结果预览' : '图纸原线预览'}>
    <path className="dxf-import-map-source" d={sheet.path} />
    {plan && result && <g transform={`translate(${-result.offset[0]} ${-result.offset[1]})`}>
      <g className="dxf-import-map-rooms">{plan.rooms.map(r => <polygon key={r.key} points={r.points} />)}</g>
      <g className="dxf-import-map-walls">{plan.walls.map(w => <polygon key={w.key} points={w.points} />)}</g>
      {plan.openings.map(o => <polygon key={o.key} className={o.kind === 'door' ? 'dxf-import-map-door' : 'dxf-import-map-window'} points={o.points} />)}
    </g>}
  </svg>;
}
