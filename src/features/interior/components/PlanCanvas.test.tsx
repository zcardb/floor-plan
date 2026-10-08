import type { PointerEvent, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import type { Design, Opening, Tool } from '../model/types';

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], svg: {} as object }));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react,
    useRef: (value: unknown) => {
      const ref = { current: hooks.refs.length === 0 ? hooks.svg : value };
      hooks.refs.push(ref);
      return ref;
    },
    useState: (value: unknown) => [value, vi.fn()],
    useEffect: vi.fn(),
    useImperativeHandle: vi.fn(),
  };
});
vi.mock('./useWallDrawing', () => ({ useWallDrawing: () => ({ clear: vi.fn(), clearHover: vi.fn(), down: vi.fn(), move: vi.fn(), up: vi.fn() }) }));
import { PlanCanvas } from './PlanCanvas';

type CanvasProps = React.ComponentProps<typeof PlanCanvas>;
type Handlers = Pick<React.SVGProps<SVGSVGElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>;
const event = (x: number, y = 0, id = 1, attribute = 'data-opening', value = 'opening') => ({
  button: 0, pointerId: id, clientX: x, clientY: y,
  target: { closest: (selector: string) => selector === `[${attribute}]` ? { getAttribute: () => value } : null },
}) as unknown as PointerEvent<SVGSVGElement>;

function harness(kind: Opening['kind'] = 'door', tool: Tool = 'select') {
  const design: Design = { ...blankDesign(), walls: [{ id: 'wall', a: [0, 0], b: [6000, 0], thickness: 200, kind: 'partition' }],
    openings: [{ id: 'opening', wallId: 'wall', kind, offset: 2000, width: 1000 }] };
  const preview = vi.fn((next: Design) => { hooks.refs[1].current = next; });
  const commit = vi.fn();
  const finishTool = vi.fn();
  const select = vi.fn();
  const props: CanvasProps = { design, selection: null, tool, layers: { grid: false, dims: false, labels: false, furn: true, bearing: false, snap: true },
    preview, commit, finishTool, select, add: vi.fn(), closePanels: vi.fn(), onScale: vi.fn(), onCoord: vi.fn(), onAnchor: vi.fn() };
  // Execute the forwardRef render with deterministic hooks and SVG coordinate conversion.
  // This tests actual event handlers without adding a DOM test dependency.
  const component = PlanCanvas as unknown as { render: (props: CanvasProps, ref: null) => ReactElement<Handlers> };
  return { handlers: component.render(props, null).props, design, preview, commit, finishTool, select };
}
beforeEach(() => {
  hooks.refs = [];
  hooks.svg = { setPointerCapture: vi.fn(), getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }) };
});
describe('PlanCanvas 门窗事件链', () => {
  it.each(['door', 'window'] as const)('%s 选中、预览、释放只提交一次原始快照', kind => {
    const h = harness(kind);
    h.handlers.onPointerDown!(event(1700, -300));
    expect(h.select).toHaveBeenCalledWith({ kind: 'opening', id: 'opening' });
    h.handlers.onPointerMove!(event(2700, 500));
    h.handlers.onPointerMove!(event(3000, 500));
    expect(h.commit).not.toHaveBeenCalled();
    h.handlers.onPointerUp!(event(3000, 500));
    h.handlers.onPointerUp!(event(3000, 500));
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit.mock.calls[0][0].openings[0].offset).toBe(3300);
    expect(h.commit.mock.calls[0][1]).toEqual(h.design);
  });
  it('单击、小幅移动、错误 pointer 与没有位置变化不提交', () => {
    const h = harness();
    h.handlers.onPointerDown!(event(2000));
    h.handlers.onPointerMove!(event(2004));
    h.handlers.onPointerMove!(event(3000, 0, 2));
    expect(h.preview).not.toHaveBeenCalled();
    h.handlers.onPointerMove!(event(2000, 800));
    h.handlers.onPointerUp!(event(2000, 800));
    expect(h.commit).not.toHaveBeenCalled();
  });
  it('取消恢复原方案，重叠候选不覆盖最后合法位置', () => {
    const h = harness();
    h.design.openings.push({ ...h.design.openings[0], id: 'neighbor', offset: 4000 });
    h.handlers.onPointerDown!(event(2000));
    h.handlers.onPointerMove!(event(2800));
    h.handlers.onPointerMove!(event(3500));
    expect(h.preview).toHaveBeenCalledTimes(1);
    h.handlers.onPointerCancel!(event(3500));
    expect(h.preview).toHaveBeenLastCalledWith(h.design);
    expect(h.commit).not.toHaveBeenCalled();
  });
  it.each(['door', 'window'] as const)('添加 %s 后完成工具模式，已有门窗也切回选择', tool => {
    const h = harness('door', tool);
    h.handlers.onPointerDown!(event(4500, 0, 1, 'data-wall', 'wall'));
    expect(h.commit.mock.calls[0][0].openings).toHaveLength(2);
    expect(h.select).toHaveBeenCalledWith({ kind: 'opening', id: expect.any(String) });
    expect(h.finishTool).toHaveBeenCalledTimes(1);
    h.handlers.onPointerUp!(event(4500));
    h.handlers.onPointerDown!(event(2000));
    expect(h.finishTool).toHaveBeenCalledTimes(2);
    h.handlers.onPointerMove!(event(2500));
    expect(h.preview.mock.calls[0][0].openings[0].offset).toBe(2500);
  });
});
