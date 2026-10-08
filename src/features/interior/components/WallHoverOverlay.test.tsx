import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Point, Wall } from '../model/types';
import { blankDesign } from '../data/templates';
import { resolveWallPoint, resolveWallHover, type WallSnap } from '../model/wallDrawing';
import { WallHoverOverlay } from './WallHoverOverlay';

const vertical: Wall = { id: 'wall', a: [0, 0], b: [0, 6000], thickness: 240, kind: 'partition' };
const candidate = (point: Point): WallSnap => ({ point, target: { wallId: 'wall', kind: 'intersection' } });
const render = (snap: WallSnap | null, wall = vertical, scale = 0.1) => renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [wall], candidate: snap, scale }));

describe('绘墙悬停沿墙距离', () => {
  it('测量变体显示两端距离，贴端显示零且不显示连接提示', () => {
    for (const [point, start, end] of [[[0, 2000], '2.00', '4.00'], [[0, 3000], '3.00', '3.00'], [[0, 0], '0.00', '6.00']] as [Point, string, string][]) {
      const html = renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [vertical], candidate: candidate(point), scale: 0.1, variant: 'measure' }));
      expect(html).toContain(`距起端 ${start} 米`); expect(html).toContain(`距末端 ${end} 米`);
      expect(html).not.toContain('点击连接');
    }
  });
  it('显示较近端到悬停点的米制距离并保留连接提示', () => {
    const html = render(candidate([0, 3000]));
    expect(html).toContain('距近端 3.00 米');
    expect(html).toContain('点击连接');
    expect(render(candidate([0, 1250]))).toContain('距近端 1.25 米');
    expect(render(candidate([0, 1251]))).toContain('距近端 1.25 米');
  });
  it('选择较近墙端，两端和墙段外投影均显示零', () => {
    for (const [y, meters] of [[0, 0], [6000, 0], [-100, 0], [6100, 0], [4000, 2], [5000, 1]]) {
      expect(render(candidate([0, y]))).toContain(`距近端 ${meters.toFixed(2)} 米`);
    }
  });
  it('水平、斜墙和反向墙均取较近端距离', () => {
    const fixtures: { wall: Wall; point: Point; meters: number }[] = [
      { wall: { ...vertical, b: [6000, 0] }, point: [3000, 0], meters: 3 },
      { wall: { ...vertical, b: [3000, 4000] }, point: [1500, 2000], meters: 2.5 },
      { wall: { ...vertical, a: [0, 6000], b: [0, 0] }, point: [0, 2000], meters: 2 },
    ];
    for (const { wall, point, meters } of fixtures) expect(render(candidate(point), wall)).toContain(`距近端 ${meters.toFixed(2)} 米`);
  });
  it('无候选、无目标或目标被移除时无提示', () => {
    expect(render(null)).toBe('');
    expect(render({ point: [0, 3000] })).toBe('');
    expect(render({ ...candidate([0, 3000]), target: { wallId: 'missing', kind: 'endpoint' } })).toBe('');
  });
  it('基于实际吸附点显示距离，关闭吸附及拆除墙时无提示', () => {
    const design = { ...blankDesign(), walls: [vertical] };
    expect(render(resolveWallPoint([100, 3000], design, 0.1, true))).toContain('距近端 3.00 米');
    expect(render(resolveWallPoint([100, 3000], design, 0.1, false))).toBe('');
    expect(render(resolveWallPoint([100, 3000], { ...design, demolished: ['wall'] }, 0.1, true))).toBe('');
    expect(render(resolveWallPoint([100, 3050], design, 0.1, true, [-3000, 3000]))).toContain('距近端 3.00 米');
  });
  it('起笔后和关闭吸附仍跟随原始鼠标测距，不误导点击连接', () => {
    const design = { ...blankDesign(), walls: [vertical] };
    const raw: Point = [100, 4000];
    const hover = resolveWallHover(raw, design, 0.1);
    for (const connection of [resolveWallPoint(raw, design, 0.1, true, [-3000, 3000]), resolveWallPoint(raw, design, 0.1, false)]) {
      const html = renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [vertical], candidate: hover, connection, scale: 0.1 }));
      expect(html).toContain('距近端 2.00 米');
      expect(html).not.toContain('点击连接');
    }
    for (const y of [1000, 3000, 4000]) {
      expect(render(resolveWallHover([100, y], design, 0.1))).toContain(`距近端 ${(Math.min(y, 6000-y)/1000).toFixed(2)} 米`);
    }
  });
  it('缩放不改变距离，提示不阻挡指针且不进入导出', () => {
    for (const scale of [0.012, 0.1, 1]) {
      const html = render(candidate([0, 3000]), vertical, scale);
      expect(html).toContain('距近端 3.00 米');
      expect(html).toContain(`font-size="${12 / scale}"`);
      expect(html).toContain('pointer-events="none"');
      expect(html).toContain('data-export-hide="true"');
    }
  });
});
