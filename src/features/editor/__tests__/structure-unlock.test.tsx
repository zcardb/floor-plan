import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankDesign, createProject, referenceDesign } from '@/lib/floor-plan/templates';
import { createSizeTransaction } from '../model/size-transaction';
import type { Design } from '@/lib/floor-plan/types';
import { BEARING_WALL_LOCKED, BEARING_WALL_WARNING, isBearingWall, setWallBearing } from '@/lib/floor-plan/wall-policy';
import { SizeFields } from '../components/size-fields';

const OLD_LOCK_TEXT = '复制该项目';
const render = (design: Design, selection: Parameters<typeof SizeFields>[0]['selection']) => {
  const transaction = createSizeTransaction(() => design, () => {}, () => {});
  return renderToStaticMarkup(createElement(SizeFields, { design, selection, transaction }));
};
const wallOfKind = (d: Design, kind: Design['walls'][number]['kind']) => d.walls.find(w => w.kind === kind && (kind === 'bearing' || !isBearingWall(w)))!;
/** renderToStaticMarkup 会转义引号，按转义后的文本比对。 */
const escaped = (text: string) => text.replace(/"/g, '&quot;');

describe('墙体尺寸面板：只有承重墙锁定', () => {
  it('旧项目、新建项目、空白项目的外围墙都可直接改尺寸', () => {
    for (const design of [referenceDesign(), createProject('reference').state, blankDesign()]) {
      const html = render(design, { kind: 'wall', id: wallOfKind(design, 'exterior').id });
      expect(html).toContain('<input');
      expect(html).toContain('墙厚');
      expect(html).not.toContain(OLD_LOCK_TEXT);
    }
  });

  it('承重墙显示锁定提示，并说明取消承重标记后可编辑', () => {
    const design = referenceDesign();
    const html = render(design, { kind: 'wall', id: wallOfKind(design, 'bearing').id });
    expect(html).toContain(escaped(BEARING_WALL_LOCKED));
    expect(html).not.toContain('<input');
    expect(html).not.toContain(OLD_LOCK_TEXT);
    const cleared = setWallBearing(design, wallOfKind(design, 'bearing').id, false);
    expect(render(cleared, { kind: 'wall', id: wallOfKind(design, 'bearing').id })).toContain('<input');
  });

  it('承重墙上的门窗可编辑尺寸，并显示承重提醒', () => {
    const design = createProject('reference').state;
    const opening = design.openings.find(o => {
      const wall = design.walls.find(w => w.id === o.wallId);
      return wall && !isBearingWall(wall);
    });
    expect(opening).toBeDefined();
    const plain = render(design, { kind: 'opening', id: opening!.id });
    expect(plain).toContain('<input');
    expect(plain).not.toContain(BEARING_WALL_WARNING);
    const bearing = setWallBearing(design, opening!.wallId, true);
    const html = render(bearing, { kind: 'opening', id: opening!.id });
    expect(html).toContain('<input');
    expect(html).toContain(BEARING_WALL_WARNING);
  });
});
