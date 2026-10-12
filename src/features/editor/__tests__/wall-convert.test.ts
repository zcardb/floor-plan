import { describe, expect, it } from 'vitest';
import { blankDesign } from '@/lib/floor-plan/templates';
import { deriveRooms } from '@/lib/floor-plan/room-derive';
import { convertStructure, structureForm } from '../model/wall-convert';
import type { Design, Wall } from '@/lib/floor-plan/types';

/** 空白户型中间加一道竖墙（带一扇门），把房屋分成左右两间。 */
function twoRooms(extra: Partial<Wall> = {}): Design {
  const d = blankDesign();
  const wall: Wall = { id: 'inner', kind: 'partition', a: [d.width / 2, 0], b: [d.width / 2, d.depth], thickness: 120, ...extra };
  return deriveRooms({ ...d, walls: [...d.walls, wall], openings: [...d.openings, { id: 'door', wallId: 'inner', kind: 'door', offset: 1000, width: 800 }] });
}
const wallT = { kind: 'wall', id: 'inner' } as const;

describe('convertStructure', () => {
  it('墙 → 垭口：整面开洞替代原有门窗，房间仍是两间；垭口 → 墙补回', () => {
    const d = twoRooms();
    expect(d.rooms).toHaveLength(2);
    const r = convertStructure(d, wallT, 'passage');
    const onWall = r.design.openings.filter(o => o.wallId === 'inner');
    expect(onWall).toHaveLength(1);
    expect(onWall[0]).toMatchObject({ kind: 'passage', width: d.depth, offset: d.depth / 2 });
    expect(r.removedOpenings).toBe(1);
    expect(r.select).toEqual({ kind: 'opening', id: onWall[0].id });
    expect(r.design.rooms).toHaveLength(2);
    expect(structureForm(r.design, wallT)!.current).toBe('passage');
    const back = convertStructure(r.design, { kind: 'opening', id: onWall[0].id }, 'wall');
    expect(back.design.openings.some(o => o.wallId === 'inner')).toBe(false);
    expect(back.select).toEqual(wallT);
  });

  it('墙 → 分隔线 → 墙：房间划分始终不变', () => {
    const d = twoRooms();
    const r = convertStructure(d, wallT, 'separator');
    expect(r.design.walls.some(w => w.id === 'inner')).toBe(false);
    const sep = r.design.separators!.find(s => s.id === (r.select as { id: string }).id)!;
    expect([sep.a, sep.b]).toEqual([[d.width / 2, 0], [d.width / 2, d.depth]]);
    expect(r.design.rooms).toHaveLength(2);
    const wall = convertStructure(r.design, { kind: 'separator', id: sep.id }, 'wall');
    expect(wall.design.separators!.some(s => s.id === sep.id)).toBe(false);
    expect(wall.design.walls.find(w => w.id === (wall.select as { id: string }).id)).toMatchObject({ kind: 'partition', thickness: d.thickness });
    expect(wall.design.rooms).toHaveLength(2);
  });

  it('分隔线 → 垭口：补墙并整面开洞', () => {
    const sepDesign = convertStructure(twoRooms(), wallT, 'separator');
    const r = convertStructure(sepDesign.design, sepDesign.select as { kind: 'separator'; id: string }, 'passage');
    expect(r.select.kind).toBe('opening');
    expect(r.design.openings.find(o => o.id === (r.select as { id: string }).id)!.kind).toBe('passage');
  });

  it('局部垭口 → 分隔线：只把洞口那段换成分隔线，两侧墙段保留', () => {
    const d = twoRooms();
    d.openings = d.openings.map(o => (o.id === 'door' ? { ...o, kind: 'passage' as const, offset: 2000, width: 1000 } : o));
    const r = convertStructure(d, { kind: 'opening', id: 'door' }, 'separator');
    const sep = r.design.separators!.find(s => s.id === (r.select as { id: string }).id)!;
    expect([sep.a[1], sep.b[1]]).toEqual([1500, 2500]);
    const x = d.width / 2;
    const remaining = r.design.walls.filter(w => w.a[0] === x && w.b[0] === x).map(w => [w.a[1], w.b[1]]);
    expect(remaining).toEqual(expect.arrayContaining([[0, 1500], [2500, d.depth]]));
    expect(r.design.rooms).toHaveLength(2);
  });

  it('承重墙：墙的其他形态锁定；其上的垭口可补回墙但不能换成分隔线', () => {
    const bearing = twoRooms({ loadBearing: true });
    expect(structureForm(bearing, wallT)!.locked).toEqual({ passage: expect.stringContaining('承重'), separator: expect.stringContaining('承重') });
    expect(() => convertStructure(bearing, wallT, 'separator')).toThrow('承重');
    bearing.openings = bearing.openings.map(o => (o.id === 'door' ? { ...o, kind: 'passage' as const } : o));
    expect(structureForm(bearing, { kind: 'opening', id: 'door' })!.locked).toEqual({ separator: expect.stringContaining('承重') });
  });

  it('替换为当前形态不产生改动；普通门没有形态', () => {
    const d = twoRooms();
    expect(convertStructure(d, wallT, 'wall').design).toBe(d);
    expect(structureForm(d, { kind: 'opening', id: 'door' })).toBeNull();
  });
});
