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
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Button } from '@/components/ui/button';
import { ColorPicker } from './ColorPicker';

type Props = React.ComponentProps<typeof SelectionEditor>;
function harness(kind: Opening['kind'], hidden = false, extra: Partial<Props> = {}) {
  const design = { ...blankDesign(), openings: [{ id: 'opening', wallId: 'wall', kind, width: 1000, offset: 2000 }] };
  const node = { style: { visibility: '', pointerEvents: '', transform: '' }, offsetWidth: 250, offsetHeight: 40, contains: () => false };
  state.node = node;
  const stage = { clientWidth: 800, clientHeight: 600, querySelectorAll: () => [] };
  const props: Props = { design, selection: { kind: 'opening', id: 'opening' }, stage: { current: stage as unknown as HTMLElement },
    hidden, showCosts: false, transaction: createSizeTransaction(() => design, vi.fn(), vi.fn()),
    change: vi.fn(), rotate: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), close: vi.fn(), details: vi.fn(), costs: vi.fn(), ...extra };
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
  it('门窗等非选择模式保持隐藏，避免误显示', () => {
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

const furniture = (id: string, cx: number, groupId?: string) => ({ id, type: 'chair', name: id, cx, cy: 1000, w: 400, d: 400, rot: 0, color: '#efe6d8', ...(groupId ? { groupId } : {}) });
describe('家具组合与颜色', () => {
  const buttons = (element: ReactElement) => {
    const out: ReactElement<{ 'aria-label'?: string; onClick?: () => void }>[] = [];
    const walk = (tree: React.ReactNode) => {
      if (Array.isArray(tree)) return tree.forEach(walk);
      if (!tree || typeof tree !== 'object' || !('props' in tree)) return;
      const node = tree as ReactElement<{ children?: React.ReactNode }>;
      if (node.type === 'button') out.push(node as never);
      walk(node.props.children);
    };
    walk((element.props as { children?: React.ReactNode }).children);
    return out;
  };
  const groupHarness = (items: ReturnType<typeof furniture>[], toggleGroup = vi.fn()) => {
    const design = { ...blankDesign(), furniture: items };
    return harness('door', false, { design, selection: { kind: 'group', ids: items.map(item => item.id) }, toggleGroup });
  };
  it('未组合的多选显示「组合」，点击触发组合', () => {
    const toggleGroup = vi.fn();
    const h = groupHarness([furniture('a', 1000), furniture('b', 2000)], toggleGroup);
    const toggle = buttons(h.element).find(button => button.props['aria-label'] === '组合')!;
    toggle.props.onClick!();
    expect(toggleGroup).toHaveBeenCalledOnce();
    expect(buttons(h.element).some(button => button.props['aria-label'] === '解除组合')).toBe(false);
  });
  it('选中一个完整组合时显示「解除组合」，标题写明已组合', () => {
    const h = groupHarness([furniture('a', 1000, 'g1'), furniture('b', 2000, 'g1')]);
    expect(buttons(h.element).some(button => button.props['aria-label'] === '解除组合')).toBe(true);
    expect(collectText(h.element)).toContain('已组合 2 件家具');
  });
  it('工具条只有一个色块触发器，打开的是统一颜色弹层', () => {
    const design = { ...blankDesign(), furniture: [furniture('a', 1000)] };
    const h = harness('door', false, { design, selection: { kind: 'furniture', id: 'a' } });
    const pickers = elements(h.element).filter(node => node.type === ColorPicker);
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.props).toMatchObject({ variant: 'swatch', value: '#efe6d8', label: '家具颜色' });
    expect(elements(h.element).some(node => node.type === 'input')).toBe(false);
  });
});
const elements = (tree: React.ReactNode): ReactElement<Record<string, unknown>>[] => {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const node = tree as ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
  return [node, ...elements(node.props.children)];
};
const collectText = (tree: React.ReactNode): string => {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(collectText).join('');
  return tree && typeof tree === 'object' && 'props' in tree ? collectText((tree as ReactElement<{ children?: React.ReactNode }>).props.children) : '';
};
describe('Visual editor 悬浮提示覆盖', () => {
  const walk = (tree: React.ReactNode, insideTooltip = false): { label?: string; covered: boolean }[] => {
    if (Array.isArray(tree)) return tree.flatMap(child => walk(child, insideTooltip));
    if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
    const node = tree as ReactElement<{ children?: React.ReactNode; 'aria-label'?: string }>;
    const covered = insideTooltip || node.type === EditorTooltip;
    const self = node.type === 'button' || node.type === Button
      ? [{ label: node.props['aria-label'], covered }]
      : [];
    return [...self, ...walk(node.props.children, covered)];
  };
  it('工具条内每个可点按钮都在悬浮提示内，并带有可访问名称', () => {
    const buttons = walk((harness('door').element.props as { children: React.ReactNode }).children);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.covered).toBe(true);
      expect(button.label).toBeTruthy();
    }
  });
});
