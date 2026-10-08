import type { PointerEvent, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import type { Design, Opening, Tool } from '../model/types';

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], svg: {} as object,
  measurement: { clear: vi.fn(), clearHover: vi.fn(), down: vi.fn(), move: vi.fn(), up: vi.fn() },
}));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react,
    useRef: (value: unknown) => {
      const ref = { current: hooks.refs.length === 0 ? hooks.svg : value };
      hooks.refs.push(ref);
      return ref;
    },
    useState: (value: unknown) => [value, vi.fn()],
    useMemo: (compute: () => unknown) => compute(),
    useEffect: vi.fn(),
    useImperativeHandle: vi.fn(),
  };
});
vi.mock('./useWallDrawing', () => ({ useWallDrawing: () => ({ clear: vi.fn(), clearHover: vi.fn(), down: vi.fn(), move: vi.fn(), up: vi.fn() }) }));
vi.mock('./useSegmentDrawing', () => ({ useSegmentDrawing: () => hooks.measurement }));
import { PlanCanvas } from './PlanCanvas';
import { PerimeterDimensions } from './PerimeterDimensions';
import { OpeningDistances } from './OpeningDistances';
import { Children, isValidElement } from 'react';

type CanvasProps = React.ComponentProps<typeof PlanCanvas>;
type Handlers = Pick<React.SVGProps<SVGSVGElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onMouseDown' | 'onDoubleClick' | 'onContextMenu'>;
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
  return { handlers: component.render(props, null).props, design, preview, commit, finishTool, select, props, component };
}
beforeEach(() => {
  hooks.refs = [];
  Object.values(hooks.measurement).forEach(mock => mock.mockClear());
  hooks.svg = { hasPointerCapture: () => true, releasePointerCapture: vi.fn(), setPointerCapture: vi.fn(), getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }) };
});
describe('PlanCanvas 承重保护', () => {
  it.each(['select', 'demolish', 'door', 'window'] as Tool[])('%s 不修改用户标记承重墙', tool => {
    const h = harness('door', tool); h.design.walls[0].loadBearing = true;
    h.handlers.onPointerDown!(event(2000, 0, 1, 'data-wall', 'wall'));
    h.handlers.onPointerMove!(event(3000)); h.handlers.onPointerUp!(event(3000));
    expect(h.commit).not.toHaveBeenCalled(); expect(h.preview).not.toHaveBeenCalled();
  });
  it('已有开口仍可选中但不能拖动', () => {
    const h = harness(); h.design.walls[0].loadBearing = true;
    h.handlers.onPointerDown!(event(2000)); h.handlers.onPointerMove!(event(3000)); h.handlers.onPointerUp!(event(3000));
    expect(h.select).toHaveBeenCalledWith({ kind: 'opening', id: 'opening' }); expect(h.commit).not.toHaveBeenCalled(); expect(h.preview).not.toHaveBeenCalled();
  });
});
describe('PlanCanvas 测量完成事件链', () => {
  it('测量手势调用共享 down/move/up，不走旧测量提交路径', () => {
    const h = harness('door', 'measure');
    h.handlers.onPointerDown!(event(2000));
    h.handlers.onPointerMove!(event(3000));
    h.handlers.onPointerUp!(event(3000));
    expect(hooks.measurement.down).toHaveBeenCalledWith([2000, 0], 1, [2000, 0]);
    expect(hooks.measurement.move).toHaveBeenCalledWith([3000, 0]);
    expect(hooks.measurement.up).toHaveBeenCalledWith([3000, 0], 1, [3000, 0]);
    expect(h.commit).not.toHaveBeenCalled();
  });
  it.each(['onDoubleClick', 'onContextMenu'] as const)('%s 清理并退出，释放指针但不提交末段', handler => {
    const h = harness('door', 'measure');
    h.handlers.onPointerDown!(event(2000));
    const preventDefault = vi.fn();
    h.handlers[handler]!({ preventDefault } as unknown as React.MouseEvent<SVGSVGElement>);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(hooks.measurement.clear).toHaveBeenCalledOnce();
    expect(h.finishTool).toHaveBeenCalledOnce();
    expect((hooks.svg as { releasePointerCapture: ReturnType<typeof vi.fn> }).releasePointerCapture).toHaveBeenCalledWith(1);
    expect(h.commit).not.toHaveBeenCalled();
  });
  it('第二次鼠标按下先结束，不把双击的第二点提交', () => {
    const h = harness('door', 'measure');
    h.handlers.onPointerDown!({ ...event(2000), pointerType: 'mouse' });
    h.handlers.onMouseDown!({ button: 0, detail: 1, preventDefault: vi.fn() } as unknown as React.MouseEvent<SVGSVGElement>);
    expect(hooks.measurement.down).toHaveBeenCalledOnce();
    h.handlers.onPointerDown!({ ...event(3000), pointerType: 'mouse' });
    h.handlers.onMouseDown!({ button: 0, detail: 2, preventDefault: vi.fn() } as unknown as React.MouseEvent<SVGSVGElement>);
    expect(hooks.measurement.down).toHaveBeenCalledOnce();
    expect(hooks.measurement.clear).toHaveBeenCalledOnce();
    expect(h.commit).not.toHaveBeenCalled();
  });
  it('指针取消仅清理草稿，不退出工具或清除既有测量', () => {
    const h = harness('door', 'measure');
    h.design.measures.push({ id: 'saved', a: [0, 0], b: [1000, 0] });
    h.handlers.onPointerDown!(event(2000));
    h.handlers.onPointerCancel!(event(2500));
    expect(hooks.measurement.clear).toHaveBeenCalledOnce();
    expect(h.design.measures).toHaveLength(1);
    expect(h.finishTool).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
  });
});
describe('PlanCanvas 自动尺寸接线', () => {
  it('尺寸开关控制真实派生层，不因为当前画墙工具而强制显示', () => {
    const h = harness();
    const renderDimensions = (enabled: boolean, tool: Tool) => {
      hooks.refs = [];
      const tree = h.component.render({ ...h.props, tool, layers: { ...h.props.layers, dims: enabled } }, null);
      const children = (tree.props as React.SVGProps<SVGSVGElement>).children;
      return Children.toArray(children).filter(child => isValidElement(child) && child.type === PerimeterDimensions);
    };
    expect(renderDimensions(false, 'wall')).toHaveLength(0);
    const shown = renderDimensions(true, 'select');
    expect(shown).toHaveLength(1);
    expect((shown[0] as ReactElement<{ layout: { horizontal: { start: number; end: number }[] } }>).props.layout.horizontal)
      .toEqual([expect.objectContaining({ start: 0, end: 6000 })]);
  });
});
describe('PlanCanvas 墙端点连接事件链', () => {
  function endpointHarness() {
    const h = harness();
    h.design.openings = [];
    h.design.walls = [{ id: 'wall', a: [0, 30], b: [1000, 30], thickness: 200, kind: 'partition' }, { id: 'target', a: [2000, 0], b: [2000, 1000], thickness: 200, kind: 'partition' }];
    hooks.refs = [];
    h.handlers = h.component.render({ ...h.props, selection: { kind: 'wall', id: 'wall' } }, null).props;
    return h;
  }
  it('拖动端点靠近错位目标精确吸附，释放只提交一次且保留原快照', () => {
    const h = endpointHarness();
    h.handlers.onPointerDown!(event(1000, 30, 1, 'data-handle', 'b'));
    h.handlers.onPointerMove!(event(1950, 40));
    expect(h.preview.mock.calls[0][0].walls[0].b).toEqual([2000, 0]);
    expect(h.preview.mock.calls[0][0].walls[1]).toEqual(h.design.walls[1]);
    h.handlers.onPointerUp!(event(1950, 40));
    h.handlers.onPointerUp!(event(1950, 40));
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit.mock.calls[0][0].walls[0].b).toEqual([2000, 0]);
    expect(h.commit.mock.calls[0][1]).toEqual(h.design);
  });
  it('取消连接恢复未吸附的原始坐标', () => {
    const h = endpointHarness();
    h.handlers.onPointerDown!(event(1000, 30, 1, 'data-handle', 'b'));
    h.handlers.onPointerMove!(event(1950, 40));
    h.handlers.onPointerCancel!(event(1950, 40));
    expect(h.preview).toHaveBeenLastCalledWith(h.design);
    expect(h.commit).not.toHaveBeenCalled();
  });
});
describe('PlanCanvas 门窗事件链', () => {
  it('选中门窗时距离层接收实时设计，关闭外围尺寸仍显示，取消选中隐藏', () => {
    const h = harness();
    const overlay = (design: Design, selected: boolean) => {
      hooks.refs = [];
      const tree = h.component.render({ ...h.props, design, selection: selected ? { kind: 'opening', id: 'opening' } : null }, null);
      return Children.toArray((tree.props as React.SVGProps<SVGSVGElement>).children).filter(c => isValidElement(c) && c.type === OpeningDistances) as ReactElement<{ design: Design }>[];
    };
    expect(overlay(h.design, true)[0].props.design.openings[0].offset).toBe(2000);
    const moved = { ...h.design, openings: [{ ...h.design.openings[0], offset: 3000 }] };
    expect(overlay(moved, true)[0].props.design).toBe(moved);
    expect(overlay(h.design, false)).toHaveLength(0);
  });
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
