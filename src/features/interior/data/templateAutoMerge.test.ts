import { describe, expect, it } from 'vitest';
import { createProject, designForTemplate, referenceDesign, TEMPLATE_PRESETS } from './templates';
import { length } from '../model/geometry';
import { isBearingWall } from '../model/wallPolicy';
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

  it('原木之家：所有门都可沿墙移动（独立的飘窗段、夹在两段承重墙之间的整门段保持原样）', () => {
    const d = createProject('reference').state;
    const touches = (p: number[]) => d.walls.some(w => isBearingWall(w) && [w.a, w.b].some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1));
    const betweenBearing = (o: Opening) => { const h = d.walls.find(w => w.id === o.wallId)!; return touches(h.a) && touches(h.b); };
    expect(d.openings.filter(o => o.kind === 'door' && !betweenBearing(o)).every(o => hostLonger(d, o))).toBe(true);
  });

  it('复刻出来的门可以沿墙拖动', () => {
    const d = createProject('two-bed').state;
    const door = d.openings.find(o => o.kind === 'door')!;
    const wall = d.walls.find(w => w.id === door.wallId)!;
    const L = length(wall), dir = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
    const step = door.offset > L / 2 ? -100 : 100;
    const moved = dragOpening(d, door.id, [0, 0], [dir[0] * step, dir[1] * step])?.openings.find(o => o.id === door.id);
    // 拖动按默认 5 cm 步进取整洞口边到墙端的距离，误差不超过半个步进。
    expect(Math.abs(moved!.offset - (door.offset + step))).toBeLessThanOrEqual(25);
    expect((moved!.offset - moved!.width / 2) % 50).toBeCloseTo(0);
  });

  it('原木之家：只有原始角落承重小段是承重墙，外墙不被整面升级为承重', () => {
    const d = designForTemplate('reference');
    const bearing = d.walls.filter(isBearingWall);
    expect(bearing.length).toBeGreaterThan(0);
    expect(bearing.every(w => w.kind === 'bearing' && !w.loadBearing)).toBe(true);
    const total = (ws: Design['walls']) => ws.reduce((s, w) => s + length(w), 0);
    expect(total(bearing)).toBeCloseTo(total(referenceDesign().walls.filter(isBearingWall)));
  });

  it('原木之家：室内门洞口段原先标为外围墙，合并后所在隔墙不会被升级为外围墙', () => {
    const d = designForTemplate('reference');
    const door = d.openings.find(o => o.id === 'door0')!;
    expect(d.walls.find(w => w.id === door.wallId)!.kind).toBe('partition');
  });
});
