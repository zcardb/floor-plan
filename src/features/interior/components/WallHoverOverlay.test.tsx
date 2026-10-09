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
/** 两段读数（到起点、到终点），按出现顺序。 */
const readings = (html: string) => [...html.matchAll(/(\d+\.\d{2}) m</g)].map(m => m[1]);

describe('墙体悬停：到两端的距离', () => {
  it('沿墙标出悬停点到两端的两段距离，并保留连接提示', () => {
    const html = render(candidate([0, 3000]));
    expect(readings(html)).toEqual(['3.00', '3.00']);
    expect(html).toContain('点击连接');
    expect(readings(render(candidate([0, 1250])))).toEqual(['1.25', '4.75']);
    expect(readings(render(candidate([0, 1251])))).toEqual(['1.25', '4.75']);
  });
  it('端点与墙段外投影：一段为零，另一段为整墙长', () => {
    for (const [y, expected] of [[0, ['0.00', '6.00']], [-100, ['0.00', '6.00']], [6000, ['6.00', '0.00']], [6100, ['6.00', '0.00']]] as const) {
      expect(readings(render(candidate([0, y])))).toEqual(expected);
    }
  });
  it('水平、斜墙和反向墙均按墙起点到终点分段', () => {
    const fixtures: { wall: Wall; point: Point; expected: string[] }[] = [
      { wall: { ...vertical, b: [6000, 0] }, point: [2000, 0], expected: ['2.00', '4.00'] },
      { wall: { ...vertical, b: [3000, 4000] }, point: [1500, 2000], expected: ['2.50', '2.50'] },
      { wall: { ...vertical, a: [0, 6000], b: [0, 0] }, point: [0, 2000], expected: ['4.00', '2.00'] },
    ];
    for (const { wall, point, expected } of fixtures) expect(readings(render(candidate(point), wall))).toEqual(expected);
  });
  it('无候选、无目标、目标缺失或已拆除时不显示', () => {
    expect(render(null)).toBe('');
    expect(render({ point: [0, 3000] })).toBe('');
    expect(render({ ...candidate([0, 3000]), target: { wallId: 'missing', kind: 'endpoint' } })).toBe('');
    expect(renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [vertical], candidate: candidate([0, 3000]), scale: 0.1, demolished: ['wall'] }))).toBe('');
  });
  it('基于实际吸附点显示距离，关闭吸附及拆除墙时无提示', () => {
    const design = { ...blankDesign(), walls: [vertical] };
    expect(readings(render(resolveWallPoint([100, 3000], design, 0.1, true)))).toEqual(['3.00', '3.00']);
    expect(render(resolveWallPoint([100, 3000], design, 0.1, false))).toBe('');
    expect(render(resolveWallPoint([100, 3000], { ...design, demolished: ['wall'] }, 0.1, true))).toBe('');
  });
  it('起笔后和关闭吸附仍跟随原始鼠标测距，不误导点击连接', () => {
    const design = { ...blankDesign(), walls: [vertical] };
    const raw: Point = [100, 4000];
    const hover = resolveWallHover(raw, design, 0.1);
    for (const connection of [resolveWallPoint(raw, design, 0.1, true, [-3000, 3000]), resolveWallPoint(raw, design, 0.1, false)]) {
      const html = renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [vertical], candidate: hover, connection, scale: 0.1 }));
      expect(readings(html)).toEqual(['4.00', '2.00']);
      expect(html).not.toContain('点击连接');
    }
  });
  it('选择模式不传连接点时不显示「点击连接」', () => {
    const html = renderToStaticMarkup(createElement(WallHoverOverlay, { walls: [vertical], candidate: candidate([0, 3000]), connection: null, scale: 0.1 }));
    expect(readings(html)).toEqual(['3.00', '3.00']);
    expect(html).not.toContain('点击连接');
  });
  it('缩放不改变距离，提示不阻挡指针且不进入导出', () => {
    for (const scale of [0.012, 0.1, 1]) {
      const html = render(candidate([0, 3000]), vertical, scale);
      expect(readings(html)).toEqual(['3.00', '3.00']);
      expect(html).toContain(`font-size="${12 / scale}"`);
      expect(html).toContain('pointer-events="none"');
      expect(html).toContain('data-export-hide="true"');
    }
  });
});
