import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
import type { Opening } from '../model/types';

const state = vi.hoisted(() => ({ node: {} as object, firstRef: true, handle: {} as { update: (rect: unknown) => void } }));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react,
    useRef: (value: unknown) => {
      const current = state.firstRef ? state.node : value;
      state.firstRef = false;
      return { current };
    },
    useState: (value: unknown) => [value, vi.fn()],
    useContext: () => ({}),
    useEffect: vi.fn(),
    useImperativeHandle: (_ref: unknown, create: () => typeof state.handle) => { state.handle = create(); },
  };
});
vi.mock('./CostDefaultsContext', async importOriginal => {
  const original = await importOriginal<typeof import('./CostDefaultsContext')>();
  return { ...original, useCostDesign: (design: unknown) => design };
});
import { SelectionEditor } from './SelectionEditor';

type Props = React.ComponentProps<typeof SelectionEditor>;
function harness(kind: Opening['kind'], hidden = false) {
  const design = { ...blankDesign(), openings: [{ id: 'opening', wallId: 'wall', kind, width: 1000, offset: 2000 }] };
  const node = { style: { visibility: '', pointerEvents: '', transform: '' }, offsetWidth: 250, offsetHeight: 40, contains: () => false };
  state.node = node;
  const stage = { clientWidth: 800, clientHeight: 600, querySelectorAll: () => [] };
  const props: Props = { design, selection: { kind: 'opening', id: 'opening' }, stage: { current: stage as unknown as HTMLElement },
    hidden, showCosts: false, transaction: createSizeTransaction(() => design, vi.fn(), vi.fn()),
    change: vi.fn(), rotate: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), close: vi.fn(), details: vi.fn(), costs: vi.fn() };
  const component = SelectionEditor as unknown as { render: (props: Props, ref: null) => ReactElement };
  const element = component.render(props, null);
  return { node, element, update: state.handle.update };
}
beforeEach(() => {
  state.firstRef = true;
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => vi.unstubAllGlobals());
describe('门窗 Visual editor 定位与可见性', () => {
  it.each(['door', 'window'] as const)('%s 在有效锚点处显示工具条，并跟随新的位置', kind => {
    const h = harness(kind);
    expect(h.element.props).toMatchObject({ role: 'toolbar', 'aria-label': '选中对象编辑工具条' });
    h.update({ left: 100, top: 100, right: 150, bottom: 150 });
    expect(h.node.style.visibility).toBe('visible');
    expect(h.node.style.pointerEvents).toBe('auto');
    const first = h.node.style.transform;
    h.update({ left: 400, top: 300, right: 450, bottom: 350 });
    expect(h.node.style.transform).not.toBe(first);
    expect(h.node.style.visibility).toBe('visible');
  });
  it('添加/测量等非选择模式保持隐藏，避免误显示', () => {
    const h = harness('door', true);
    h.update({ left: 100, top: 100, right: 150, bottom: 150 });
    expect(h.node.style.visibility).toBe('hidden');
    expect(h.node.style.pointerEvents).toBe('none');
  });
  it('取消选择或完全离屏时隐藏，重新获得锚点时恢复', () => {
    const h = harness('window');
    for (const rect of [null, { left: 900, top: 100, right: 950, bottom: 150 }]) {
      h.update(rect);
      expect(h.node.style.visibility).toBe('hidden');
      expect(h.node.style.pointerEvents).toBe('none');
    }
    h.update({ left: 100, top: 100, right: 150, bottom: 150 });
    expect(h.node.style.visibility).toBe('visible');
  });
});
