import { useMemo } from 'react';
import { bbox, length, wallPoly } from '../model/geometry';
import { connectedWallPoly, wallSectionPolygons } from '../model/wallConnections';
import { formatMeters } from '../model/lengthUnits';
import { displayOffset } from '../model/wallSplitDraft';
import type { Design, Point } from '../model/types';

interface Props { design: Design; wallId: string; intervals: number[]; selected: number; reversed?: boolean }
const pointsText = (points: Point[]) => points.map(p => p.join(',')).join(' ');

export function WallSplitPreview({ design, wallId, intervals, selected, reversed = false }: Props) {
  // Geometry is stable while typing; do not recompute wall connections for each draft keystroke.
  const geometry = useMemo(() => {
    const wall = design.walls.find(w => w.id === wallId)!;
    const bounds = bbox([wall.a, wall.b]);
    const pad = Math.max(500, wall.thickness * 2, length(wall) * 0.18);
    const local = { x: bounds.x - pad, y: bounds.y - pad, x2: bounds.x2 + pad, y2: bounds.y2 + pad };
    const intersects = (points: Point[]) => { const b = bbox(points); return b.x <= local.x2 && b.x2 >= local.x && b.y <= local.y2 && b.y2 >= local.y; };
    const scale = Math.min(220 / Math.max(bounds.x2 - bounds.x, wall.thickness * 2), 110 / Math.max(bounds.y2 - bounds.y, wall.thickness * 2));
    const cx = (bounds.x + bounds.x2) / 2, cy = (bounds.y + bounds.y2) / 2;
    const map = (p: Point): Point => [180 + (p[0] - cx) * scale, 145 + (p[1] - cy) * scale];
    const L = length(wall);
    const forward: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
    return { wall, map, L, forward, polygon: connectedWallPoly(wall, design.walls, design.demolished),
      neighbors: design.walls.filter(w => w.id !== wallId && !design.demolished.includes(w.id) && intersects([w.a, w.b])).map(w => ({ id: w.id, points: wallPoly(w) })),
      rooms: design.rooms.filter(r => intersects(r.rings[0])) };
  }, [design, wallId]);
  const { wall, map, L, forward, polygon } = geometry;
  const start = reversed ? wall.b : wall.a;
  const direction: Point = reversed ? [-forward[0], -forward[1]] : forward;
  const at = (offset: number): Point => map([wall.a[0] + forward[0] * offset, wall.a[1] + forward[1] * offset]);
  const A = map(start), B = map(reversed ? wall.a : wall.b);
  const count = Math.max(intervals.length - 1, 0);
  const selectedPolygons = intervals.length > selected + 1 && selected >= 0
    ? wallSectionPolygons(wall, polygon, intervals[selected], intervals[selected + 1]) : [];
  const arrowAt = at(L / 2);
  const arrowStart: Point = [arrowAt[0] - direction[1] * 22, arrowAt[1] + direction[0] * 22];
  const arrowEnd: Point = [arrowStart[0] + direction[0] * 28, arrowStart[1] + direction[1] * 28];
  const arrowLeft: Point = [arrowEnd[0] - direction[0] * 7 - direction[1] * 4, arrowEnd[1] - direction[1] * 7 + direction[0] * 4];
  const arrowRight: Point = [arrowEnd[0] - direction[0] * 7 + direction[1] * 4, arrowEnd[1] - direction[1] * 7 - direction[0] * 4];
  const slots = count === 3 ? [180] : [95, 265];
  const cuts = intervals.slice(1, -1)
    .map(offset => ({ offset, shown: displayOffset(L, offset, reversed) }))
    .sort((a, b) => a.shown - b.shown)
    .map((cut, i) => ({ ...cut, number: i + 1, x: slots[i] ?? 180 }));
  return <svg className="wall-split-map" viewBox="0 0 360 250" role="img" aria-label={`局部户型示意：A为量距起点（${reversed ? '已交换' : '默认'}），B为终点，距离从A量取`}>
    <title>局部户型 · A 起点 → B 终点</title>
    <g className="wall-split-map-rooms">{geometry.rooms.flatMap(r => r.rings.map((ring, i) => <polygon key={`${r.id}:${i}`} points={pointsText(ring.map(map))} />))}</g>
    <g className="wall-split-map-context">{geometry.neighbors.map(w => <polygon key={w.id} points={pointsText(w.points.map(map))} />)}</g>
    <polygon className="wall-split-map-wall" points={pointsText(polygon.map(map))} />
    {selectedPolygons.map((p, i) => <polygon key={i} className="wall-split-map-result" data-segment={selected + 1} points={pointsText(p.map(map))} />)}
    <g className="wall-split-map-direction"><line x1={arrowStart[0]} y1={arrowStart[1]} x2={arrowEnd[0]} y2={arrowEnd[1]} /><polyline points={pointsText([arrowLeft, arrowEnd, arrowRight])} /></g>
    {([['A', A, -1], ['B', B, 1]] as const).map(([name, p, sign]) => {
      const label: Point = [Math.max(45, Math.min(315, p[0] + direction[0] * sign * 48)), Math.max(76, Math.min(224, p[1] + direction[1] * sign * 42 + 20))];
      return <g key={name} className="wall-split-map-endpoint" data-endpoint={name}>
        <line x1={p[0]} y1={p[1]} x2={label[0]} y2={label[1]} />
        <circle cx={p[0]} cy={p[1]} r={5} />
        <rect x={label[0] - 37} y={label[1] - 13} width={74} height={26} rx={7} />
        <text x={label[0]} y={label[1]}>{name} {name === 'A' ? '起点' : '终点'}</text>
      </g>;
    })}
    {cuts.map(cut => <g key={cut.number} className="wall-split-map-cut" data-cut={cut.number}>
      <line x1={at(cut.offset)[0]} y1={at(cut.offset)[1]} x2={cut.x} y2={44} />
      <circle cx={at(cut.offset)[0]} cy={at(cut.offset)[1]} r={4} />
      <rect x={cut.x - 72} y={12} width={144} height={32} rx={7} />
      <text x={cut.x} y={28}>点 {cut.number} · 距 A {formatMeters(cut.shown)} m</text>
    </g>)}
  </svg>;
}
