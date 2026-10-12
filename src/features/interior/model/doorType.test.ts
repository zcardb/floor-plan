import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { blankDesign } from '../data/templates';
import { createDrawingDocument, openingDrawing } from './drawingDocument';
import { serializeDrawing } from './drawingExport';
import { changeDoorType, doorSweeps, doorSymbol, doorType } from './doorType';
import { validateDesign } from './validation';
import type { Design, Opening } from './types';

const door = (patch: Partial<Opening> = {}): Opening => ({ id: 'door', wallId: 'w', kind: 'door', offset: 2000, width: 1200, ...patch });
const layers = { grid: false, dims: false, labels: false, furn: false, bearing: false, snap: false };

/** 6 m 横墙上一扇门（宽 1200）。 */
function fixture(patch: Partial<Opening> = {}): Design {
  const d = blankDesign();
  const w = d.walls[0];
  return { ...d, openings: [{ ...door(patch), wallId: w.id }] };
}

describe('门的开启方式', () => {
  it('缺省为单开：一扇门扇（宽 = 洞口宽）+ 一段 90° 开启弧', () => {
    const s = doorSymbol(door());
    expect(doorType(door())).toBe('single');
    expect(s.leaves).toHaveLength(1);
    expect(s.arcs).toHaveLength(1);
    expect(s.arcs[0].radius).toBe(1200);
    expect(s.panels).toEqual([]);
    expect(doorSweeps(door())).toHaveLength(1);
  });

  it('双开：两扇各半宽，分别铰接在洞口两端，弧线在中间相接', () => {
    const s = doorSymbol(door({ doorType: 'double' }));
    expect(s.leaves.map(l => l.from[0])).toEqual([-600, 600]);
    expect(s.arcs.map(a => a.radius)).toEqual([600, 600]);
    expect(s.arcs.map(a => a.to)).toEqual([[0, 0], [0, 0]]);
    expect(doorSweeps(door({ doorType: 'double' }))).toHaveLength(2);
  });

  it('推拉：两扇错位叠放、覆盖整个洞口，没有门扇回转与开启弧', () => {
    const s = doorSymbol(door({ doorType: 'sliding' }));
    expect(s.leaves).toEqual([]);
    expect(s.arcs).toEqual([]);
    expect(s.panels).toHaveLength(2);
    expect(Math.min(...s.panels.map(p => p.x))).toBe(-600);
    expect(Math.max(...s.panels.map(p => p.x + p.width))).toBe(600);
    expect(s.panels[0].y).not.toBe(s.panels[1].y);
    expect(doorSweeps(door({ doorType: 'sliding' }))).toEqual([]);
  });

  it('切换开启方式只改这扇门，位置、宽度和窗户不变；保存后可读回', () => {
    const d = fixture();
    const next = changeDoorType(d, 'door', 'double');
    expect(next.openings[0]).toEqual({ ...d.openings[0], doorType: 'double' });
    expect(validateDesign(JSON.parse(JSON.stringify(next))).openings[0].doorType).toBe('double');
    expect(() => validateDesign({ ...next, openings: [{ ...next.openings[0], doorType: 'folding' }] })).toThrow();
  });
});

describe('门的 CAD 导出（DXF）', () => {
  it('单开 / 双开 / 推拉各自成图块，全部在 A-DOOR 图层：门扇 LINE、开启弧 ARC、推拉门扇闭合 LWPOLYLINE', () => {
    const parse = (type?: Opening['doorType']) => new DxfParser().parseSync(serializeDrawing(fixture(type ? { doorType: type } : {}), 'dxf'))!;
    const blockOf = (dxf: ReturnType<typeof parse>, prefix: RegExp) => Object.entries(dxf.blocks).find(([name]) => prefix.test(name))![1];
    const types = (dxf: ReturnType<typeof parse>, prefix: RegExp) => (blockOf(dxf, prefix).entities ?? []).map(e => e.type).sort();

    const single = parse();
    expect(types(single, /^DOOR_\d/)).toEqual(['ARC', 'LINE']);
    const double = parse('double');
    expect(types(double, /^DOOR_DOUBLE_/)).toEqual(['ARC', 'ARC', 'LINE', 'LINE']);
    const sliding = parse('sliding');
    expect(types(sliding, /^DOOR_SLIDING_/)).toEqual(['LWPOLYLINE', 'LWPOLYLINE']);

    for (const dxf of [single, double, sliding]) {
      const inserts = dxf.entities.filter(e => e.type === 'INSERT') as unknown as { name: string; layer: string }[];
      expect(inserts.filter(i => i.name.startsWith('DOOR')).every(i => i.layer === 'A-DOOR')).toBe(true);
    }
  });

  it('画布、导出用同一份门符号；不同开启方式不会共用一个图块', () => {
    const d = fixture();
    d.openings.push({ ...d.openings[0], id: 'door2', offset: 4500, doorType: 'double' });
    const blocks = createDrawingDocument(d, layers).blocks.map(b => b.name).filter(n => n.startsWith('DOOR'));
    expect(blocks).toEqual(['DOOR_1200x' + d.walls[0].thickness, 'DOOR_DOUBLE_1200x' + d.walls[0].thickness]);
    expect(openingDrawing({ ...door(), doorType: 'sliding' }, 240).every(e => e.kind === 'polyline' && e.closed)).toBe(true);
  });
});
