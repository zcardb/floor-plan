import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, Point } from '../model/types';
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], states: [] as unknown[], effects: [] as (() => unknown)[], r: 0, s: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useRef: (value: unknown) => { const i = hooks.r++; return hooks.refs[i] ?? (hooks.refs[i] = { current: value }); },
  useState: (value: unknown) => { const i = hooks.s++; if (!(i in hooks.states)) hooks.states[i] = value; return [hooks.states[i], (next: unknown) => { hooks.states[i] = next; }]; },
  useCallback: (value: unknown) => value,
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
}));
import { useSegmentDrawing } from './useSegmentDrawing';
import { useWallDrawing } from './useWallDrawing';
import { blankDesign } from '../data/templates';
function harness(wall = false, snap = true) {
  const design: { current: Design } = { current: { ...blankDesign(), walls: [{ id: 'target', a: [0, 0] as Point, b: [6000, 0] as Point, thickness: 200, kind: 'partition' as const }] } };
  const commit = vi.fn((next: Design) => { design.current = next; });
  const done = vi.fn();
  // Deterministic hook harness deliberately chooses the tool under test.
  /* eslint-disable react-hooks/rules-of-hooks */
  const render = (enabled = true) => {
    hooks.r = 0; hooks.s = 0; hooks.effects = [];
    return wall ? useWallDrawing(enabled, design, 0.1, snap, commit, done) : useSegmentDrawing(enabled, design, 0.1, snap, (d, a, b) => {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 100) throw new Error('short');
      commit({ ...d, measures: [...d.measures, { id: String(d.measures.length), a, b }] });
    }, done);
  };
  /* eslint-enable react-hooks/rules-of-hooks */
  return { render, design, commit, done };
}
beforeEach(() => { hooks.refs = []; hooks.states = []; hooks.effects = []; hooks.r = 0; hooks.s = 0; });
describe('共享连续取点状态机', () => {
  it.each([false, true])('测量/绘墙共用起点吸附、连续取点和方向锁定 wall=%s', wall => {
    const h = harness(wall), d = h.render();
    d.down([1000, 50], 1, [0, 0]); d.up([1000, 50], 1, [0, 0]);
    expect(h.commit).not.toHaveBeenCalled();
    expect(d.move([2200, 1800]).point).toEqual([1000, 1800]);
    d.down([1000, 1800], 1, [20, 20]); d.up([1000, 1800], 1, [20, 20]);
    d.down([3000, 1800], 1, [30, 20]); d.up([3000, 1800], 1, [30, 20]);
    expect(h.commit).toHaveBeenCalledTimes(2);
    const segments = wall ? h.design.current.walls.slice(1) : h.design.current.measures;
    expect(segments.map(s => [s.a, s.b])).toEqual([[[1000, 0], [1000, 1800]], [[1000, 1800], [3000, 1800]]]);
    if (!wall) expect(h.design.current.walls).toHaveLength(1);
    d.clear(); d.up([4000, 1800], 1, [40, 20]);
    expect(h.commit).toHaveBeenCalledTimes(2); expect(h.render().draft).toBeNull();
  });
  it('测量可沿墙穿过开口，首段拖动阈值与最小长度生效', () => {
    const h = harness(), d = h.render();
    h.design.current.openings = [{ id: 'o', kind: 'door', wallId: 'target', offset: 2000, width: 900 }];
    d.down([0, 0], 1, [0, 0]); d.up([6000, 0], 1, [5, 0]);
    expect(h.commit).not.toHaveBeenCalled(); d.clear();
    d.down([0, 0], 1, [0, 0]); d.up([6000, 0], 1, [6, 0]);
    expect(h.design.current.measures).toHaveLength(1);
    d.down([6050, 0], 1, [10, 0]); d.up([6050, 0], 1, [10, 0]);
    expect(h.commit).toHaveBeenCalledTimes(1);
  });
  it('无吸附取点和闭合结束，无重复提交', () => {
    const h = harness(false, false), d = h.render();
    d.down([1000, 50], 1, [0, 0]); d.up([2000, 50], 1, [10, 0]);
    expect(h.design.current.measures[0].a).toEqual([1000, 50]);
    d.down([1000, 50], 1, [0, 0]); d.up([1000, 50], 1, [0, 0]);
    expect(h.done).toHaveBeenCalledOnce(); expect(h.render().draft).toBeNull();
    d.up([1000, 50], 1, [0, 0]); expect(h.commit).toHaveBeenCalledTimes(2);
  });
  it.each(['Enter', 'Escape'])('%s 清理草稿并退出，保留已提交段', key => {
    const listener = vi.fn(); vi.stubGlobal('window', { addEventListener: listener, removeEventListener: vi.fn() });
    try {
      const h = harness(), d = h.render(); hooks.effects.forEach(e => e());
      d.down([0, 0], 1, [0, 0]); d.up([1000, 0], 1, [10, 0]); d.move([1000, 2000]);
      const callback = listener.mock.calls[0][1] as (event: KeyboardEvent) => void;
      callback({ key, target: { closest: () => null }, preventDefault: vi.fn() } as unknown as KeyboardEvent);
      expect(h.done).toHaveBeenCalledOnce(); expect(h.design.current.measures).toHaveLength(1);
      expect(h.render().draft).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
