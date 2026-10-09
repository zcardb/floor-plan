import { describe, expect, it } from 'vitest';
import { createProject, referenceDesign, TEMPLATE_PRESETS } from './templates';
import { length } from '../model/geometry';
import { dragOpening } from '../model/openingDrag';
import type { Design, Opening } from '../model/types';

/** 门窗所在墙段比洞口长：门窗两侧留有余量，才能沿墙拖动。 */
const hostLonger = (d: Design, o: Opening) => length(d.walls.find(w => w.id === o.wallId)!) > o.width + 1;

describe('复刻模板默认清空分割', () => {
  it.each(TEMPLATE_PRESETS.filter(p => p.id !== 'reference').map(p => p.id))('%s：所有门窗都不再独占满宽墙段', id => {
    const d = createProject(id).state;
    expect(d.walls.some(w => w.id.startsWith('opening-wall-'))).toBe(false);
    expect(d.openings.every(o => hostLonger(d, o))).toBe(true);
  });

  it('原木之家：所有门都可沿墙移动（独立的飘窗段本身就是整窗，保持原样）', () => {
    const d = createProject('reference').state;
    expect(d.openings.filter(o => o.kind === 'door').every(o => hostLonger(d, o))).toBe(true);
  });

  it('复刻出来的门可以沿墙拖动', () => {
    const d = createProject('two-bed').state;
    const door = d.openings.find(o => o.kind === 'door')!;
    const wall = d.walls.find(w => w.id === door.wallId)!;
    const L = length(wall), dir = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
    const step = door.offset > L / 2 ? -100 : 100;
    const moved = dragOpening(d, door.id, [0, 0], [dir[0] * step, dir[1] * step]);
    expect(moved?.openings.find(o => o.id === door.id)?.offset).toBeCloseTo(door.offset + step);
  });

  it('原木之家：室内门洞口段原先标为外围墙，合并后所在隔墙不会被升级为外围墙', () => {
    const d = referenceDesign();
    const door = d.openings.find(o => o.id === 'door0')!;
    expect(d.walls.find(w => w.id === door.wallId)!.kind).toBe('partition');
  });
});
