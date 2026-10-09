import { describe, expect, it } from 'vitest';
import { blankDesign, designForTemplate } from '../data/templates';
import { isPristineDesign, nextGuestEditCount } from './templateState';

const referenceDesign = () => designForTemplate('reference');

describe('初始模版判定', () => {
  it('刚生成的模版、以及带解锁标记的模版都算初始态', () => {
    expect(isPristineDesign(referenceDesign())).toBe(true);
    expect(isPristineDesign({ ...referenceDesign(), structureUnlocked: true })).toBe(true);
    expect(isPristineDesign(blankDesign())).toBe(true);
  });

  it('家具 id 每次生成都不同，不因此判成改过模版', () => {
    const a = referenceDesign(), b = referenceDesign();
    expect(a.furniture[0].id).not.toBe(b.furniture[0].id);
    expect(isPristineDesign(b)).toBe(true);
  });

  it('视图偏好不算改模版', () => {
    expect(isPristineDesign({ ...referenceDesign(), dimensionSettings: { visible: false } })).toBe(true);
  });

  it('动一件家具、删一面墙、改材质都算改过模版', () => {
    const moved = referenceDesign();
    moved.furniture[0] = { ...moved.furniture[0], cx: moved.furniture[0].cx + 200 };
    expect(isPristineDesign(moved)).toBe(false);
    const gone = referenceDesign();
    gone.furniture = gone.furniture.slice(1);
    expect(isPristineDesign(gone)).toBe(false);
    const demolished = referenceDesign();
    demolished.demolished = [demolished.walls[0].id];
    expect(isPristineDesign(demolished)).toBe(false);
    const painted = referenceDesign();
    painted.rooms[0] = { ...painted.rooms[0], mat: 'tile600' };
    expect(isPristineDesign(painted)).toBe(false);
    const blank = blankDesign();
    blank.furniture = [...blank.furniture, { id: 'x', type: 'chair', name: '椅子', cx: 1000, cy: 1000, w: 450, d: 480, rot: 0, color: '#e8dccb' }];
    expect(isPristineDesign(blank)).toBe(false);
  });

  it('重置方案 / 撤销回起点后计数归零，中途改动累加', () => {
    const edited = referenceDesign();
    edited.furniture[0] = { ...edited.furniture[0], rot: 90 };
    expect(nextGuestEditCount(0, edited)).toBe(1);
    expect(nextGuestEditCount(1, edited)).toBe(2);
    expect(nextGuestEditCount(2, { ...referenceDesign(), structureUnlocked: true })).toBe(0);
    expect(nextGuestEditCount(3, blankDesign())).toBe(0);
  });
});
