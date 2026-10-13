import { describe, expect, it } from 'vitest';
import { blankDesign } from '../templates';
import { area, rect } from '../geometry';
import { deriveRooms } from '../room-derive';
import type { Design, Wall } from '../types';

const wall = (id: string, a: [number, number], b: [number, number], kind: Wall['kind'] = 'partition', thickness = 120): Wall =>
  ({ id, a, b, kind, thickness });
/** 6000 × 6000 空白外框，x=3000 一面隔墙。 */
const twoRooms = (): Design => deriveRooms({ ...blankDesign(), walls: [...blankDesign().walls, wall('mid', [3000, 0], [3000, 6000])] });

describe('deriveRooms', () => {
  it('删墙后两间房并成一间，沿用重叠更大的那间（不留白条）', () => {
    const d = twoRooms();
    const [left, right] = d.rooms;
    const named = { ...d, rooms: [{ ...left!, name: '卧室', mat: 'tile600' }, { ...right!, name: '书房' }] };
    const next = deriveRooms({ ...named, walls: named.walls.filter(w => w.id !== 'mid') });
    expect(next.rooms).toHaveLength(1);
    expect(next.rooms[0]!.rings).toHaveLength(1);
    expect(area(next.rooms[0]!)).toBeCloseTo(36, 1);
  });

  it('0.82 m² 的小空间也成为房间；墙缝碎块不算', () => {
    const base = blankDesign();
    // 右下角隔出净 820 × 1000 的小间（墙厚 100）。
    const closet = { ...base, walls: [...base.walls, wall('v', [5130, 5000], [5130, 6000], 'partition', 100), wall('h', [5080, 4950], [6000, 4950], 'partition', 100)] };
    const rooms = deriveRooms(closet).rooms;
    expect(rooms).toHaveLength(2);
    expect(Math.min(...rooms.map(area))).toBeCloseTo(0.82, 2);
    // 只有 150 mm 宽的墙缝不算房间。
    const slit = { ...base, walls: [...base.walls, wall('n', [5775, 0], [5775, 6000], 'partition', 100)] };
    expect(deriveRooms(slit).rooms).toHaveLength(1);
  });

  it('分隔线把房间一分为二，删掉后合并回原房间', () => {
    const d = blankDesign(), id = d.rooms[0]!.id;
    const split = deriveRooms({ ...d, separators: [{ id: 's', a: [2000, 0], b: [2000, 6000] }] });
    expect(split.rooms).toHaveLength(2);
    expect(split.rooms[0]!.id).toBe(id);
    expect(split.rooms[1]!.name).toBe('房间 2');
    const merged = deriveRooms({ ...split, separators: [] });
    expect(merged.rooms).toHaveLength(1);
    expect(merged.rooms[0]!.id).toBe(id);
    expect(area(merged.rooms[0]!)).toBeCloseTo(36, 1);
  });

  it('矮墙不分隔房间，但能围出阳台', () => {
    const d = blankDesign();
    const low = { ...d, walls: [...d.walls, wall('low', [0, 3000], [6000, 3000], 'low')] };
    expect(deriveRooms(low).rooms).toHaveLength(1);
    // 外框右侧开口，用矮墙封住：阳台仍算房间。
    const open = { ...d, walls: d.walls.filter(w => w.id !== 'outer-1') };
    expect(deriveRooms(open).rooms).toHaveLength(0);
    const parapet = { ...open, walls: [...open.walls, { ...d.walls.find(w => w.id === 'outer-1')!, id: 'rail', kind: 'low' as const }] };
    expect(deriveRooms(parapet).rooms).toHaveLength(1);
  });

  it('全新围出的区域按面积排序命名为「房间 n」，木地板', () => {
    const d: Design = { ...blankDesign(), rooms: [{ id: 'x', name: '房间 1', mat: 'tile600', rings: [rect(0, 0, 6000, 6000)] }] };
    const next = deriveRooms({ ...d, walls: [...d.walls, wall('v', [4000, 0], [4000, 6000])] }, []);
    expect(next.rooms.map(r => [r.name, r.mat])).toEqual([['房间 1', 'wood'], ['房间 2', 'wood']]);
  });
});
