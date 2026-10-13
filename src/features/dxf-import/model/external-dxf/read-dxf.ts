/** DXF 解析单独成模块：dxf-parser 只在导入图纸时才下载，不进首屏包。 */
import DxfParser from 'dxf-parser';
import type { Point } from '@/lib/floor-plan/types';
import { boundsOf } from './vector';
import type { DxfSegment, DxfSource, DxfUnit } from './dxf-source';

/** 2D 仿射变换 [a, b, c, d, e, f]：x' = a·x + c·y + e，y' = b·x + d·y + f。 */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const apply = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const multiply = (p: Matrix, q: Matrix): Matrix => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const MAX_SEGMENTS = 60000;
const MAX_DEPTH = 4;
const INSUNITS: Record<number, DxfUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

type XY = { x: number; y: number };
interface RawEntity {
  type: string; layer?: string; inPaperSpace?: boolean;
  vertices?: XY[]; shape?: boolean;
  center?: XY; radius?: number; startAngle?: number; endAngle?: number;
  name?: string; position?: XY; xScale?: number; yScale?: number; rotation?: number;
}
interface RawBlock { entities?: RawEntity[]; position?: XY }

/** 没写单位时按图纸范围猜：住宅一般 5–50 m。 */
function guessUnit(segments: DxfSegment[]): DxfUnit {
  if (!segments.length) return 'mm';
  const box = boundsOf(segments.flatMap(s => [s.a, s.b]));
  const extent = Math.max(box.x2 - box.x, box.y2 - box.y);
  return extent < 200 ? 'm' : extent < 5000 ? 'cm' : 'mm';
}

/** 解析外部 DXF，展开块并拆成带图层的直线段。 */
export function readDxfSource(text: string): DxfSource {
  let dxf: ReturnType<DxfParser['parseSync']>;
  try { dxf = new DxfParser().parseSync(text); } catch { throw new Error('DXF 文件无法解析，请确认是文本格式的 DXF'); }
  if (!dxf) throw new Error('DXF 文件无法解析，请确认是文本格式的 DXF');
  const blocks = (dxf.blocks ?? {}) as unknown as Record<string, RawBlock>;
  const segments: DxfSegment[] = [];
  let groups = 0;
  const push = (a: Point, b: Point, layer: string, group: number | undefined, arc?: boolean) => {
    if (segments.length >= MAX_SEGMENTS) throw new Error('图纸线条过多，请在 CAD 中只保留墙体和门窗图层后再导入');
    if (a.every(Number.isFinite) && b.every(Number.isFinite) && (a[0] !== b[0] || a[1] !== b[1]))
      segments.push({ a, b, layer, ...(group === undefined ? {} : { group }), ...(arc ? { arc } : {}) });
  };
  const walk = (entities: RawEntity[], m: Matrix, parentLayer: string | undefined, group: number | undefined, depth: number) => {
    for (const e of entities) {
      if (e.inPaperSpace) continue;
      const layer = parentLayer && (!e.layer || e.layer === '0') ? parentLayer : e.layer || '0';
      if (e.type === 'LINE' && e.vertices && e.vertices.length >= 2) {
        push(apply(m, e.vertices[0].x, e.vertices[0].y), apply(m, e.vertices[1].x, e.vertices[1].y), layer, group);
      } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
        const points = e.vertices.map(v => apply(m, v.x, v.y));
        for (let i = 0; i + 1 < points.length; i++) push(points[i], points[i + 1], layer, group);
        if (e.shape && points.length > 2) push(points[points.length - 1], points[0], layer, group);
      } else if (e.type === 'ARC' && e.center && e.radius) {
        const start = e.startAngle ?? 0;
        let end = e.endAngle ?? Math.PI * 2;
        if (end <= start) end += Math.PI * 2;
        const steps = Math.max(2, Math.ceil((end - start) / (Math.PI / 12)));
        const at = (t: number) => apply(m, e.center!.x + e.radius! * Math.cos(t), e.center!.y + e.radius! * Math.sin(t));
        for (let i = 0; i < steps; i++) push(at(start + ((end - start) * i) / steps), at(start + ((end - start) * (i + 1)) / steps), layer, group, true);
      } else if (e.type === 'INSERT' && e.name && depth < MAX_DEPTH) {
        const block = blocks[e.name];
        if (!block?.entities?.length) continue;
        const r = ((e.rotation ?? 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1;
        const base = block.position ?? { x: 0, y: 0 }, p = e.position ?? { x: 0, y: 0 };
        const local: Matrix = multiply(
          [Math.cos(r) * sx, Math.sin(r) * sx, -Math.sin(r) * sy, Math.cos(r) * sy, p.x, p.y],
          [1, 0, 0, 1, -base.x, -base.y],
        );
        walk(block.entities, multiply(m, local), layer, group ?? ++groups, depth + 1);
      }
    }
  };
  walk((dxf.entities ?? []) as unknown as RawEntity[], IDENTITY, undefined, undefined, 0);
  if (!segments.length) throw new Error('图纸中没有可识别的线条（支持直线、多段线、圆弧和图块）');
  const counts = new Map<string, number>();
  for (const s of segments) counts.set(s.layer, (counts.get(s.layer) ?? 0) + 1);
  const declared = INSUNITS[Number(dxf.header?.$INSUNITS)];
  return {
    segments,
    layers: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    unit: declared ?? guessUnit(segments),
    unitDetected: !!declared,
  };
}
