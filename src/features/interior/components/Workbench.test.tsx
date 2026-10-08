import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, Project } from '../model/types';

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], design: null as Design | null, change: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: (effect: () => unknown) => { state.effects.push(effect); },
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => ({ current: value }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./CustomFurnitureDialog', () => ({ CustomFurnitureDialog: () => null }));
vi.mock('../model/useDesign', () => ({ useDesign: () => ({
  design: state.design, change: state.change, commit: vi.fn(), preview: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  counts: { undo: 0, redo: 0 }, sizeTransaction: { flush: vi.fn(), cancel: vi.fn() },
}) }));
import { Workbench } from './Workbench';
import { blankDesign, referenceDesign } from '../data/templates';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function text(tree: ReactNode): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : '';
}
function render() {
  state.cursor = 0;
  const noop = vi.fn();
  return nodes(Workbench({
    project: { id: 'test', name: '测试', state: state.design } as Project,
    projectNavigation: { projectList: [], hasMore: false, listLoading: false, onOpen: noop, onLoadMore: noop },
    update: noop, status: '', loggedIn: false, projects: noop, login: noop, logout: noop,
    save: noop, cloudSave: noop, importProject: noop,
  }));
}
function tools(tree: Node[]) {
  const group = tree.find(node => node.props.className === 'tool-group')!;
  return nodes(group);
}
beforeEach(() => { state.values = []; state.cursor = 0; state.effects = []; state.design = blankDesign(); state.change.mockReset(); });
describe('2D 常用工具与更多菜单', () => {
  it('直接展示选择、绘墙、门、窗，并切换对应画布工具及选中态', () => {
    expect(tools(render()).filter(node => node.props.label).map(node => node.props.label)).toEqual(['选择', '绘墙', '门', '窗']);
    for (const [label, tool] of [['选择', 'select'], ['绘墙', 'wall'], ['门', 'door'], ['窗', 'window']]) {
      const button = tools(render()).find(node => node.props.label === label)!;
      (button.props.onClick as () => void)();
      expect(state.values[1]).toBe(tool);
      expect(tools(render()).find(node => node.props.label === label)!.props.active).toBe(true);
    }
    const tree = tools(render());
    expect(tree.filter(node => node.type === 'button').map(node => node.props['aria-label'])).toEqual(['更多']);
    expect(text(tree.map(node => node.props.children as ReactNode))).not.toContain('添加门');
  });
  it('更多菜单切换测量与拆改，入口高亮且保留快捷键和标记', () => {
    for (const [label, tool, shortcut] of [['测量距离', 'measure', 'M'], ['拆改非承重墙', 'demolish', 'X']]) {
      const item = tools(render()).find(node => node.props.onSelect && text(node.props.children as ReactNode).startsWith(label))!;
      expect(text(item.props.children as ReactNode)).toContain(shortcut);
      (item.props.onSelect as () => void)();
      expect(state.values[1]).toBe(tool);
      const tree = tools(render());
      expect(tree.find(node => node.props['aria-label'] === '更多')!.props.className).toContain('active');
      expect(nodes(tree.find(node => node.props.onSelect && text(node.props.children as ReactNode).startsWith(label))!).some(node => node.props.className === 'menu-mark')).toBe(true);
    }
  });
  it('无测量线时禁用清除，有测量线时保留数量并清空', () => {
    const clear = () => tools(render()).find(node => node.props.onSelect && text(node.props.children as ReactNode).startsWith('清除测量线'))!;
    expect(clear().props.disabled).toBe(true);
    state.design = { ...state.design!, measures: [{ id: 'm1', a: [0, 0], b: [1000, 0] }] };
    expect(clear().props.disabled).toBe(false);
    expect(text(clear().props.children as ReactNode)).toContain('1');
    (clear().props.onSelect as () => void)();
    const update = state.change.mock.calls[0][0] as (design: Design) => Design;
    expect(update(state.design).measures).toEqual([]);
  });
  it('V、M、X、Esc 保留工具切换，输入框与 3D 不触发测量拆改', () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    vi.stubGlobal('window', {
      addEventListener: (name: string, callback: (event: KeyboardEvent) => void) => listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const attach = () => {
      state.effects = [];
      render();
      for (const effect of state.effects) effect();
    };
    const key = (value: string, input = false) => listeners.get('keydown')!({
      key: value, target: { matches: () => input }, preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
    try {
      attach();
      for (const [shortcut, tool] of [['m', 'measure'], ['x', 'demolish'], ['v', 'select'], ['m', 'measure'], ['Escape', 'select']]) {
        key(shortcut);
        expect(state.values[1]).toBe(tool);
      }
      key('m', true);
      expect(state.values[1]).toBe('select');
      state.values[2] = '3d';
      attach();
      key('m'); key('x');
      expect(state.values[1]).toBe('select');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('参考户型不开放绘墙和门窗，3D 保持原有工具', () => {
    state.design = referenceDesign();
    expect(tools(render()).filter(node => node.props.label).map(node => node.props.label)).toEqual(['选择']);
    state.values[2] = '3d';
    expect(tools(render()).filter(node => node.props.label).map(node => node.props.label)).toEqual(['鸟瞰', '漫游', '俯视', '剖切']);
    expect(tools(render()).some(node => node.props['aria-label'] === '更多')).toBe(false);
  });
});
