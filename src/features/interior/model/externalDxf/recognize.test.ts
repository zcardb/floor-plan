import { describe, expect, it } from 'vitest';
import { blankDesign } from '../../data/templates';
import { createExportDocument } from '../drawingDocument';
import { serializeDxf } from '../dxfExport';
import { area, length } from '../geometry';
import { readDxfSource, type DxfSegment } from './dxfSource';
import { guessRoles, recognizeDxf } from './recognize';

type XY = [number, number];
const line = (a: XY, b: XY, layer: string) => ['0', 'LINE', '8', layer, '10', a[0], '20', a[1], '11', b[0], '21', b[1]].join('\n');
const closed = (points: XY[], layer: string) => points.map((p, i) => line(p, points[(i + 1) % points.length], layer));
/** 6000×4000 净空、240 墙的双线户型，中间一道 240 隔墙；隔墙上留 900 的门洞。单位由 scale 决定。 */
function plan(scale = 1, door = true) {
  const k = (points: XY[]) => points.map(([x, y]) => [x * scale, y * scale] as XY);
  const gap = door ? [[1500, 2400]] : [];
  const face = (x: number) => (gap.length
    ? [line(...(k([[x, 240], [x, 1500]]) as [XY, XY]), 'WALL'), line(...(k([[x, 2400], [x, 4240]]) as [XY, XY]), 'WALL')]
    : [line(...(k([[x, 240], [x, 4240]]) as [XY, XY]), 'WALL')]);
  const walls = [
    ...closed(k([[0, 0], [6480, 0], [6480, 4480], [0, 4480]]), 'WALL'),
    // 左右两个房间的内墙面：隔墙一侧单独画，便于留门洞。
    line(...(k([[240, 240], [3120, 240]]) as [XY, XY]), 'WALL'), line(...(k([[240, 4240], [3120, 4240]]) as [XY, XY]), 'WALL'), line(...(k([[240, 240], [240, 4240]]) as [XY, XY]), 'WALL'),
    line(...(k([[3360, 240], [6240, 240]]) as [XY, XY]), 'WALL'), line(...(k([[3360, 4240], [6240, 4240]]) as [XY, XY]), 'WALL'), line(...(k([[6240, 240], [6240, 4240]]) as [XY, XY]), 'WALL'),
    ...face(3120), ...face(3360),
    ...gap.flatMap(([s, e]) => [line(...(k([[3120, s], [3360, s]]) as [XY, XY]), 'WALL'), line(...(k([[3120, e], [3360, e]]) as [XY, XY]), 'WALL')]),
  ];
  const doorBlock = ['0', 'BLOCK', '8', '0', '2', 'DOOR90', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'DOOR90',
    line([0, 0], [0, 900], '0'),
    ['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '900', '50', '0', '51', '90'].join('\n'),
    '0', 'ENDBLK'].join('\n');
  // 门块铰链放在门洞下沿（墙轴线上），旋转 90° 后门扇朝 -x 打开。
  const insert = ['0', 'INSERT', '8', 'DOOR', '2', 'DOOR90', '10', 3240 * scale, '20', 1500 * scale, '41', scale, '42', scale, '50', '90'].join('\n');
  return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', scale === 1 ? '4' : '6', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', doorBlock, '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...walls, ...(door ? [insert] : []), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}
const recognize = (text: string, patch: Record<string, 'wall' | 'door' | 'window' | 'opening' | 'ignore'> = {}) => {
  const source = readDxfSource(text);
  return recognizeDxf(source.segments, { unit: source.unit, roles: { ...guessRoles(source.layers.map(l => l.name)), ...patch } });
};

describe('外部 DXF 识别', () => {
  it('读出图层、单位，并把图块展开成线段', () => {
    const source = readDxfSource(plan());
    expect(source.unit).toBe('mm'); expect(source.unitDetected).toBe(true);
    expect(source.layers.map(l => l.name).sort()).toEqual(['DOOR', 'WALL']);
    const door = source.segments.filter(s => s.layer === 'DOOR');
    expect(door.length).toBeGreaterThan(3);
    expect(new Set(door.map(s => s.group)).size).toBe(1);
    // 旋转 90°：门扇从 (3240,1500) 指向 -x。
    expect(door[0].a[0]).toBeCloseTo(3240); expect(door[0].b[0]).toBeCloseTo(2340); expect(door[0].b[1]).toBeCloseTo(1500);
  });
  it('双线墙配成墙轴：5 面墙、厚 240、2 个房间、外墙标成外围墙', () => {
    const { design, stats, warnings } = recognize(plan(1, false));
    expect(stats).toEqual({ walls: 5, doors: 0, windows: 0, rooms: 2 });
    expect(warnings).toEqual([]);
    expect(design.walls.every(w => w.thickness === 240)).toBe(true);
    expect(design.walls.filter(w => w.kind === 'exterior')).toHaveLength(4);
    expect(design.walls.filter(w => w.kind === 'partition')).toHaveLength(1);
    expect(design.walls.map(w => Math.round(length(w))).sort((a, b) => a - b)).toEqual([4240, 4240, 4240, 6240, 6240]);
    expect(design.rooms.map(r => +area(r).toFixed(2))).toEqual([11.52, 11.52]);
    expect([design.width, design.depth, design.thickness, design.template]).toEqual([6480, 4480, 240, 'reference']);
  });
  it('门块落在墙缺口里：两段墙并成一面，生成 900 的门并带开向', () => {
    const { design, stats } = recognize(plan());
    expect(stats).toEqual({ walls: 5, doors: 1, windows: 0, rooms: 2 });
    const door = design.openings[0], wall = design.walls.find(w => w.id === door.wallId)!;
    expect(wall.kind).toBe('partition'); expect(door.kind).toBe('door'); expect(door.width).toBe(900);
    expect(Math.round(length(wall))).toBe(4240);
    expect(door.hinge).toBeDefined(); expect(door.swingSide).toBeDefined();
    // 门洞中心在图纸 y=1950；方案 Y 向下，离隔墙两端分别 1950-120 和 4480-1950-120。
    expect([1830, 2410]).toContain(Math.round(door.offset));
  });
  it('单位：米制图纸识别出的尺寸与毫米图纸一致，改错单位会被拦下', () => {
    const meters = readDxfSource(plan(0.001));
    expect(meters.unit).toBe('m');
    const roles = guessRoles(meters.layers.map(l => l.name));
    const { design } = recognizeDxf(meters.segments, { unit: 'm', roles });
    expect([design.width, design.depth]).toEqual([6480, 4480]);
    expect(design.openings[0].width).toBe(900);
    expect(() => recognizeDxf(meters.segments, { unit: 'mm', roles })).toThrow();
    const mm = readDxfSource(plan());
    expect(() => recognizeDxf(mm.segments, { unit: 'm', roles })).toThrow('50 m');
  });
  it('边界：墙图层被忽略时报「未识别到墙体」；门图层被忽略时门洞两侧保持两段墙、两间连通', () => {
    expect(() => recognize(plan(), { WALL: 'ignore' })).toThrow('未识别到墙体');
    const open = recognize(plan(), { DOOR: 'ignore' });
    expect(open.stats).toMatchObject({ walls: 6, doors: 0, rooms: 1 });
    expect(() => recognize(plan(), { WALL: 'door', DOOR: 'wall' })).toThrow();
  });
  it('单线墙：按 120 厚处理并给出提示', () => {
    const text = ['0', 'SECTION', '2', 'ENTITIES', ...closed([[0, 0], [5000, 0], [5000, 4000], [0, 4000]], '0'), '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const source = readDxfSource(text);
    expect(source.unitDetected).toBe(false); expect(source.unit).toBe('mm');
    const { design, stats, warnings } = recognizeDxf(source.segments, { unit: 'mm', roles: guessRoles(['0']) });
    expect(stats).toMatchObject({ walls: 4, rooms: 1 });
    expect(design.walls.every(w => w.thickness === 120 && w.kind === 'exterior')).toBe(true);
    expect(warnings[0]).toContain('单线');
  });
  it('本应用导出的 DXF 去掉嵌入数据后，也能按外部图纸识别出墙、门、窗和房间', () => {
    const d = blankDesign();
    d.walls.push({ id: 'p', a: [3000, -120], b: [3000, d.depth + 120], kind: 'partition', thickness: 240 });
    d.openings.push({ id: 'door', wallId: 'p', kind: 'door', offset: 2000, width: 900 }, { id: 'win', wallId: 'outer-0', kind: 'window', offset: 1500, width: 1200 });
    const source = readDxfSource(serializeDxf(createExportDocument(d)));
    const roles = guessRoles(source.layers.map(l => l.name));
    expect(roles).toMatchObject({ WALLS: 'wall', OPENINGS: 'opening' });
    const { design, stats } = recognizeDxf(source.segments as DxfSegment[], { unit: source.unit, roles });
    expect(stats).toEqual({ walls: 5, doors: 1, windows: 1, rooms: 2 });
    expect(design.openings.map(o => o.width).sort((a, b) => a - b)).toEqual([900, 1200]);
  });
});
