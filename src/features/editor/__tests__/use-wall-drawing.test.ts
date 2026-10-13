import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, Point } from '@/lib/floor-plan/types';
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], states: [] as unknown[], effects: [] as (() => unknown)[], r: 0, s: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useRef: (value: unknown) => { const i = hooks.r++; return hooks.refs[i] ?? (hooks.refs[i] = { current: value }); },
  useState: (value: unknown) => { const i = hooks.s++; if (!(i in hooks.states)) hooks.states[i] = value; return [hooks.states[i], (next: unknown) => { hooks.states[i] = next; }]; },
  useCallback: (value: unknown) => value,
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
}));
import { useWallDrawing } from '../hooks/use-wall-drawing';
import { blankDesign } from '@/lib/floor-plan/templates';
function harness(snap = true) {
  const design: { current: Design } = { current: { ...blankDesign(), walls: [{ id: 'target', a: [0, 0] as Point, b: [6000, 0] as Point, thickness: 200, kind: 'partition' as const }] } };
  const commit = vi.fn((next: Design) => { design.current = next; });
  const done = vi.fn();
  // Deterministic hook harness deliberately drives the drawing hook directly.
  /* eslint-disable react-hooks/rules-of-hooks */
  const render = (enabled = true) => {
    hooks.r = 0; hooks.s = 0; hooks.effects = [];
    return useWallDrawing(enabled, design, 0.1, snap, commit, done);
  };
  /* eslint-enable react-hooks/rules-of-hooks */
  return { render, design, commit, done };
}
beforeEach(() => { hooks.refs = []; hooks.states = []; hooks.effects = []; hooks.r = 0; hooks.s = 0; });
describe('共享连续取点状态机（绘墙）', () => {
  it('起点吸附、连续取点和方向锁定', () => {
    const h = harness(), d = h.render();
    d.down([1000, 50], 1, [0, 0]); d.up([1000, 50], 1, [0, 0]);
    expect(h.commit).not.toHaveBeenCalled();
    expect(d.move([2200, 1800]).point).toEqual([1000, 1800]);
    d.down([1000, 1800], 1, [20, 20]); d.up([1000, 1800], 1, [20, 20]);
    d.down([3000, 1800], 1, [30, 20]); d.up([3000, 1800], 1, [30, 20]);
    expect(h.commit).toHaveBeenCalledTimes(2);
    // 交接点默认分割：target 在 (1000,0) 被切成两段，其后是新画的两段。
    expect(h.design.current.walls.map(s => [s.a, s.b])).toEqual([[[0, 0], [1000, 0]], [[1000, 0], [6000, 0]], [[1000, 0], [1000, 1800]], [[1000, 1800], [3000, 1800]]]);
    d.clear(); d.up([4000, 1800], 1, [40, 20]);
    expect(h.commit).toHaveBeenCalledTimes(2); expect(h.render().draft).toBeNull();
  });
  it('首段拖动阈值与最小墙段长度生效', () => {
    const h = harness(), d = h.render();
    d.down([1000, 0], 1, [0, 0]); d.up([1050, 0], 1, [4, 0]);
    expect(h.commit).not.toHaveBeenCalled(); d.clear();
    d.down([1000, 0], 1, [0, 0]); d.up([1050, 0], 1, [30, 0]);
    expect(h.commit).not.toHaveBeenCalled();
    d.down([1000, 50], 1, [0, 0]); d.up([1000, 2050], 1, [30, 0]);
    expect(h.commit).toHaveBeenCalledTimes(1);
  });
  it('无吸附取点保留原始坐标，闭合回起点后结束且无重复提交', () => {
    const h = harness(false), d = h.render();
    d.down([1000, 50], 1, [0, 0]); d.up([1000, 2000], 1, [10, 0]);
    expect(h.design.current.walls[h.design.current.walls.length - 1]!.a).toEqual([1000, 50]);
    d.down([1000, 2000], 1, [20, 20]); d.up([3000, 2000], 1, [30, 20]);
    d.down([3000, 2000], 1, [40, 20]); d.up([3000, 50], 1, [50, 20]);
    d.down([3000, 50], 1, [60, 20]); d.up([1000, 50], 1, [70, 20]);
    expect(h.commit).toHaveBeenCalledTimes(4);
    expect(h.done).toHaveBeenCalledOnce(); expect(h.render().draft).toBeNull();
    d.up([1000, 50], 1, [70, 20]); expect(h.commit).toHaveBeenCalledTimes(4);
  });
  it.each(['Enter', 'Escape'])('%s 清理草稿并退出，保留已提交段', key => {
    const listener = vi.fn(); vi.stubGlobal('window', { addEventListener: listener, removeEventListener: vi.fn() });
    try {
      const h = harness(), d = h.render(); hooks.effects.forEach(e => e());
      d.down([0, 0], 1, [0, 0]); d.up([0, 2000], 1, [10, 0]); d.move([0, 3000]);
      const callback = listener.mock.calls[0][1] as (event: KeyboardEvent) => void;
      callback({ key, target: { closest: () => null }, preventDefault: vi.fn() } as unknown as KeyboardEvent);
      expect(h.done).toHaveBeenCalledOnce(); expect(h.design.current.walls).toHaveLength(2);
      expect(h.render().draft).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
