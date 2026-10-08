import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankDesign, createProject, referenceDesign } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
import type { Design } from '../model/types';
import { BEARING_WALL_WARNING, isBearingWall, setWallBearing } from '../model/wallPolicy';
import { SizeFields } from './SizeFields';

const LOCKED_TEXT = '此项目创建时锁定了结构尺寸';
const render = (design: Design, selection: Parameters<typeof SizeFields>[0]['selection']) => {
  const transaction = createSizeTransaction(() => design, () => {}, () => {});
  return renderToStaticMarkup(createElement(SizeFields, { design, selection, transaction }));
};
const wallOfKind = (d: Design, kind: Design['walls'][number]['kind']) => d.walls.find(w => w.kind === kind)!;

describe('墙体尺寸面板：复制/新建项目的结构解锁', () => {
  it('新建的参考户型项目可以直接修改外围墙尺寸', () => {
    const design = createProject('reference').state;
    const html = render(design, { kind: 'wall', id: wallOfKind(design, 'exterior').id });
    expect(html).not.toContain(LOCKED_TEXT);
    expect(html).toContain('墙厚');
  });

  it('解锁项目选中承重墙时显示结构风险提示', () => {
    const design = createProject('reference').state;
    const html = render(design, { kind: 'wall', id: wallOfKind(design, 'bearing').id });
    expect(html).toContain(BEARING_WALL_WARNING);
    expect(html).not.toContain(LOCKED_TEXT);
  });

  it('旧项目（无解锁标记）保持锁定，并说明复制即可编辑', () => {
    const design = referenceDesign();
    const html = render(design, { kind: 'wall', id: wallOfKind(design, 'exterior').id });
    expect(html).toContain(LOCKED_TEXT);
    expect(html).toContain('复制该项目后副本可自由调整');
    expect(html).not.toContain('<input');
  });

  it('空白项目的外围墙仍走整体重设，不在单墙尺寸里放开', () => {
    const design = { ...blankDesign(), structureUnlocked: true };
    const html = render(design, { kind: 'wall', id: wallOfKind(design, 'exterior').id });
    expect(html).toContain(LOCKED_TEXT);
  });

  it('承重墙上的门窗洞口锁定文案保持独立', () => {
    const design = createProject('reference').state;
    const opening = design.openings.find(o => {
      const wall = design.walls.find(w => w.id === o.wallId);
      return wall && !isBearingWall(wall);
    });
    expect(opening).toBeDefined();
    expect(render(design, { kind: 'opening', id: opening!.id })).not.toContain('门窗洞口已锁定');
    const bearing = setWallBearing(design, opening!.wallId, true);
    const html = render(bearing, { kind: 'opening', id: opening!.id });
    expect(html).toContain('门窗洞口已锁定');
    expect(html).not.toContain(LOCKED_TEXT);
  });
});
