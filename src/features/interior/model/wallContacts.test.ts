import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { wallContacts } from './wallContacts';
import { length } from './geometry';
import type { Design, Point } from './types';

/** One 6 m host wall along +x from the origin, so offsets read as x coordinates. */
const host = (): Design => ({ ...blankDesign(), walls: [{ id: 'host', kind: 'exterior', thickness: 240, a: [0, 0], b: [6000, 0] }], rooms: [], openings: [] });
const add = (d: Design, id: string, a: Point, b: Point, thickness = 240) => {
  d.walls.push({ id, kind: 'partition', thickness, a, b });
  return d;
};

describe('相接墙接触点', () => {
  it('无邻墙、共线续接与平行贴邻都不算接触点', () => {
    expect(wallContacts(host(), 'host')).toEqual([]);
    expect(wallContacts(add(host(), 'same-axis', [6000, 0], [9000, 0]), 'host')).toEqual([]);
    expect(wallContacts(add(host(), 'parallel', [1000, 120], [4000, 120]), 'host')).toEqual([]);
    expect(wallContacts(host(), 'missing')).toEqual([]);
  });
  it('T 形交接取相接墙中心线位置；端点停在墙面上也算', () => {
    expect(wallContacts(add(host(), 'centre', [2000, 0], [2000, 3000]), 'host'))
      .toEqual([{ offset: 2000, wallIds: ['centre'], kind: 'tee', blocked: false }]);
    // Drawn against the face, as the reference template draws its walls.
    expect(wallContacts(add(host(), 'face', [2000, 120], [2000, 3000]), 'host'))
      .toEqual([{ offset: 2000, wallIds: ['face'], kind: 'tee', blocked: false }]);
    // An end that stops short of the face does not touch this wall.
    expect(wallContacts(add(host(), 'gap', [2000, 200], [2000, 3000]), 'host')).toEqual([]);
  });
  it('L 形转角与相接墙超出本墙范围时不产生接触点', () => {
    // Branch whose body already reaches the host end: a corner, not a cut.
    expect(wallContacts(add(host(), 'corner', [120, 0], [120, 3000]), 'host')).toEqual([]);
    expect(wallContacts(add(host(), 'corner-b', [5880, -120], [5880, -3000]), 'host')).toEqual([]);
    expect(wallContacts(add(host(), 'beyond', [6500, 0], [6500, 3000]), 'host')).toEqual([]);
    // Just past the corner reach, the junction is a real T again.
    expect(wallContacts(add(host(), 'inside', [200, 0], [200, 3000]), 'host')[0]!.offset).toBe(200);
  });
  it('十字穿过按中心线交点记为 cross', () => {
    expect(wallContacts(add(host(), 'through', [3000, -2000], [3000, 2000]), 'host'))
      .toEqual([{ offset: 3000, wallIds: ['through'], kind: 'cross', blocked: false }]);
    // A diagonal crossing still lands on the centerline intersection.
    expect(wallContacts(add(host(), 'diagonal', [2000, -1000], [4000, 1000]), 'host')[0]).toMatchObject({ offset: 3000, kind: 'cross' });
  });
  it('已拆除墙不参与识别', () => {
    const d = add(host(), 'partition', [2000, 0], [2000, 3000]);
    expect(wallContacts({ ...d, demolished: ['partition'] }, 'host')).toEqual([]);
  });
  it('0.05 m 内的多个相接墙合并为一条，cross 优先并保留来源', () => {
    const d = add(host(), 'left', [2000, 0], [2000, 3000]);
    add(d, 'right', [2030, 0], [2030, -3000]);
    add(d, 'crossing', [2020, -3000], [2020, 3000]);
    const contacts = wallContacts(d, 'host');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.kind).toBe('cross');
    expect([...contacts[0]!.wallIds].sort()).toEqual(['crossing', 'left', 'right']);
  });
  it('间隔大于 0.05 m 时各自成点，按距 A 升序并取整到厘米', () => {
    const d = add(host(), 'far', [4000, 0], [4000, 3000]);
    add(d, 'near', [1000, 0], [1000, 3000]);
    add(d, 'odd', [2234, 0], [2234, 3000]);
    expect(wallContacts(d, 'host').map(c => [c.offset, c.wallIds[0]])).toEqual([[1000, 'near'], [2230, 'odd'], [4000, 'far']]);
  });
  it('落在门窗洞口内的接触点标记为 blocked，但仍列出', () => {
    const d = add(host(), 'partition', [2000, 0], [2000, 3000]);
    d.openings = [{ id: 'win', wallId: 'host', kind: 'window', offset: 2000, width: 900 }];
    expect(wallContacts(d, 'host')).toEqual([{ offset: 2000, wallIds: ['partition'], kind: 'tee', blocked: true }]);
    d.openings = [{ id: 'win', wallId: 'host', kind: 'window', offset: 2450, width: 900 }];
    expect(wallContacts(d, 'host')[0]!.blocked).toBe(false);
  });
  it('按存储的 a→b 方向量取，与相接墙的绘制方向无关', () => {
    const forward = wallContacts(add(host(), 'branch', [2000, 0], [2000, 3000]), 'host');
    const backward = wallContacts(add(host(), 'branch', [2000, 3000], [2000, 0]), 'host');
    expect(backward).toEqual(forward);
    const flipped = host();
    flipped.walls[0] = { ...flipped.walls[0]!, a: [6000, 0], b: [0, 0] };
    expect(wallContacts(add(flipped, 'branch', [2000, 0], [2000, 3000]), 'host')[0]!.offset).toBe(4000);
  });
  it('参考户型：接触点都在墙内、远离两端、来源有效', () => {
    const d = referenceDesign();
    let total = 0;
    for (const wall of d.walls) {
      const L = length(wall);
      for (const contact of wallContacts(d, wall.id)) {
        total++;
        expect(contact.offset).toBeGreaterThanOrEqual(50);
        expect(contact.offset).toBeLessThanOrEqual(L - 50);
        expect(contact.offset % 10).toBe(0);
        expect(contact.wallIds).not.toContain(wall.id);
        expect(contact.wallIds.every(id => d.walls.some(w => w.id === id))).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});
