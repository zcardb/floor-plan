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
import { EditorNameInput } from './EditorNameInput';
import { LayerMenu } from './LayerMenu';
import { FurniturePicker } from './FurniturePicker';
import { RoomMetrics } from './RoomMetrics';

type Props = React.ComponentProps<typeof SelectionEditor>;
function harness(kind: Opening['kind'], hidden = false, extra: Partial<Props> = {}) {
  const design = { ...blankDesign(), openings: [{ id: 'opening', wallId: 'wall', kind, width: 1000, offset: 2000 }] };
  const node = { style: { visibility: '', pointerEvents: '', transform: '' }, offsetWidth: 250, offsetHeight: 40, contains: () => false };
  state.node = node;
  const stage = { clientWidth: 800, clientHeight: 600, querySelectorAll: () => [] };
  const props: Props = { design, selection: { kind: 'opening', id: 'opening' }, stage: { current: stage as unknown as HTMLElement },
    hidden, showCosts: false, transaction: createSizeTransaction(() => design, vi.fn(), vi.fn()),
    change: vi.fn(), rotate: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), close: vi.fn(), costs: vi.fn(), ...extra };
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
    const self = node.type === 'button' || node.type === Button || node.type === 'input'
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
describe('房间与家具的工具条', () => {
  const room = { ...blankDesign(), rooms: [{ id: 'room', name: '堂屋', mat: 'wood', rings: [[[0, 0], [4000, 0], [4000, 4000], [0, 4000]]] }] };
  it('房间名称可直接改：输入框提交后写回房间名，AI 布局紧跟在名称后面', () => {
    const change = vi.fn();
    const open = vi.fn();
    const h = harness('door', false, {
      design: room, selection: { kind: 'room', id: 'room' }, change, roomAi: { tone: 'idle', open },
    } as never);
    const nodes = elements(h.element);
    const nameAt = nodes.findIndex(node => node.type === EditorNameInput), name = nodes[nameAt] as ReactElement<{ value: string; label: string; onRename: (v: string) => void }>;
    expect(name.props).toMatchObject({ value: '堂屋', label: '房间名称' });
    const aiAt = nodes.findIndex(node => node.props.className === 'visual-ai-trigger');
    const sizeAt = nodes.findIndex(node => node.props['aria-label'] === '调整房间各边长度');
    expect(aiAt).toBeGreaterThan(nameAt);
    expect(aiAt).toBeLessThan(sizeAt);
    name.props.onRename('正厅');
    expect(change).toHaveBeenCalledOnce();
    const updater = change.mock.calls[0]![0] as (d: typeof room) => typeof room;
    expect(updater(room).rooms[0]!.name).toBe('正厅');
  });
  it('房间内家具用通用带图下拉，左侧为家具 2D 图，选中即切换到该家具；尺寸弹层带概要指标', () => {
    const design = { ...room, furniture: [furniture('a', 1000), furniture('b', 9000)] };
    const select = vi.fn();
    const h = harness('door', false, { design, selection: { kind: 'room', id: 'room' }, select } as never);
    const nodes = elements(h.element);
    const picker = nodes.find(node => node.type === FurniturePicker) as ReactElement<{ items: { id: string; visual?: unknown }[]; onPick: (item: { id: string }) => void }>;
    expect(picker.props.items.map(item => item.id)).toEqual(['a']);
    expect(picker.props.items[0]!.visual).toBeTruthy();
    picker.props.onPick({ id: 'a' });
    expect(select).toHaveBeenCalledWith({ kind: 'furniture', id: 'a' });
    expect(nodes.some(node => node.type === RoomMetrics)).toBe(true);
  });
  it('房间工具条：入口叫「硬装」「家具」；金额按钮无下拉，点击直接打开本间成本面板；不再有「详细属性」', () => {
    const costs = vi.fn();
    const h = harness('door', false, { design: room, selection: { kind: 'room', id: 'room' }, select: vi.fn(), showCosts: true, costs } as never);
    const nodes = elements(h.element), text = collectText(h.element);
    expect(text).toContain('硬装');
    expect(text).not.toContain('材质');
    const picker = nodes.find(node => node.type === FurniturePicker)!;
    expect(collectText(picker.props.children as React.ReactNode)).toContain('家具');
    expect(picker.props.heading).toEqual({ title: '房间内家具', meta: '0 件' });
    const cost = nodes.find(node => node.props.className === 'visual-cost-trigger')!;
    expect(cost.type).toBe('button');
    expect(collectText(cost)).not.toContain('本间');
    (cost.props.onClick as () => void)();
    expect(costs).toHaveBeenCalledOnce();
    expect(nodes.some(node => node.props['aria-label'] === '详细属性')).toBe(false);
  });
  it('家具与多选家具都能开图层菜单，多选按整组调整', () => {
    const design = { ...blankDesign(), furniture: [furniture('a', 1000), furniture('b', 2000)] };
    const single = harness('door', false, { design, selection: { kind: 'furniture', id: 'a' } });
    const group = harness('door', false, { design, selection: { kind: 'group', ids: ['a', 'b'] } });
    const menu = (h: { element: ReactElement }) => elements(h.element).find(node => node.type === LayerMenu);
    expect(menu(single)?.props).toMatchObject({ ids: ['a'], variant: 'toolbar' });
    expect(menu(group)?.props).toMatchObject({ ids: ['a', 'b'], variant: 'toolbar' });
    expect(menu(harness('door'))).toBeUndefined();
  });
});
