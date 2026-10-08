import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { rebuildRooms } from './geometry';
import { validateDesign } from './validation';
import { removeWall, toggleWallDemolition } from './wallRemoval';
import type { Design, Wall } from './types';

const drawn: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 200 };
const blank = () => rebuildRooms({ ...blankDesign(), walls: [...blankDesign().walls, drawn] });
const withDoor = (): Design => {
  const d = blank();
  d.openings.push({ id: 'door', wallId: drawn.id, kind: 'door', offset: 2000, width: 900 });
  return d;
};
const exterior = (d: Design) => d.walls.find(w => w.kind === 'exterior')!;

describe('删除当前墙', () => {
  it('删除自绘隔墙及其门窗并重建房间，结果可再次通过校验', () => {
    const before = withDoor(), next = removeWall(before, drawn.id);
    expect(next.walls.some(w => w.id === drawn.id)).toBe(false);
    expect(next.openings.some(o => o.wallId === drawn.id)).toBe(false);
    expect(next.rooms).toHaveLength(1);
    expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(before.walls.some(w => w.id === drawn.id)).toBe(true);
  });
  it('清理已标记拆除的墙 id，避免遗留失效拆除记录', () => {
    const next = removeWall(toggleWallDemolition(blank(), drawn.id), drawn.id);
    expect(next.demolished).toEqual([]);
    expect(validateDesign(JSON.parse(JSON.stringify(next))).walls.some(w => w.id === drawn.id)).toBe(false);
  });
  it('承重墙、外围墙、参考户型墙体与不存在的墙都拒绝删除', () => {
    const reference = referenceDesign();
    expect(() => removeWall(blank(), exterior(blank()).id)).toThrow('不可删除');
    expect(() => removeWall({ ...blank(), walls: [{ ...drawn, kind: 'bearing' }] }, drawn.id)).toThrow('不可删除');
    expect(() => removeWall(reference, reference.walls.find(w => w.kind === 'partition')!.id)).toThrow('不可删除');
    expect(() => removeWall(blank(), 'missing')).toThrow('不可删除');
  });
});

describe('标记拆除当前墙', () => {
  it('非承重墙可标记与撤销，房间随拆除重建', () => {
    const before = blank(), marked = toggleWallDemolition(before, drawn.id);
    expect(marked.demolished).toEqual([drawn.id]);
    expect(marked.rooms).toHaveLength(1);
    expect(validateDesign(JSON.parse(JSON.stringify(marked)))).toEqual(marked);
    const restored = toggleWallDemolition(marked, drawn.id);
    expect(restored.demolished).toEqual([]);
    expect(restored.rooms).toHaveLength(before.rooms.length);
  });
  it('承重墙与建筑外墙拒绝拆除，参考户型外围墙保持原状', () => {
    const reference = referenceDesign();
    expect(() => toggleWallDemolition(blank(), exterior(blank()).id)).toThrow('不可拆除');
    expect(() => toggleWallDemolition({ ...blank(), walls: [{ ...drawn, kind: 'bearing' }] }, drawn.id)).toThrow('不可拆除');
    expect(() => toggleWallDemolition(reference, reference.walls.find(w => w.kind === 'bearing')!.id)).toThrow('不可拆除');
    expect(() => toggleWallDemolition(blank(), 'missing')).toThrow('不可拆除');
    const partition = reference.walls.find(w => w.kind === 'partition')!;
    const next = toggleWallDemolition(reference, partition.id);
    expect(next.demolished).toEqual([partition.id]);
    expect(next.rooms).toBe(reference.rooms);
    expect(reference.demolished).toEqual([]);
  });
});
