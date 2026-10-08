import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, Project } from '../model/types';

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], design: null as Design | null, change: vi.fn(), commit: vi.fn(), cancel: vi.fn(), confirm: vi.fn() }));
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
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => state.confirm }));
vi.mock('../cloud/useProjects', () => ({ isSaveProblem: () => false }));
vi.mock('./CustomFurnitureDialog', () => ({ CustomFurnitureDialog: () => null }));
vi.mock('../model/useDesign', () => ({ useDesign: () => ({
  design: state.design, current: { get current() { return state.design; } }, change: state.change, commit: state.commit, preview: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  counts: { undo: 0, redo: 0 }, sizeTransaction: { flush: vi.fn(), cancel: state.cancel },
}) }));
import { Workbench } from './Workbench';
import { blankDesign, referenceDesign } from '../data/templates';
import { PlanCanvas } from './PlanCanvas';
import { DimensionEditDialog } from './DimensionEditDialog';
import { WallSplitDialog } from './WallSplitDialog';
import { PropertyPanel } from './PropertyPanel';
import { SelectionEditor } from './SelectionEditor';
import { perimeterDimensions } from '../model/perimeterDimensions';
import type { DimensionSegment } from '../model/perimeterDimensions';

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
    update: noop, status: { kind: 'saved' as const, label: '' }, loggedIn: false, projects: noop, login: noop, logout: noop,
    save: noop, cloudSave: noop, importProject: noop,
  }));
}
function tools(tree: Node[]) {
  const group = tree.find(node => node.props.className === 'tool-group')!;
  return nodes(group);
}
beforeEach(() => { state.values = []; state.cursor = 0; state.effects = []; state.design = blankDesign(); state.change.mockReset(); state.commit.mockReset(); state.cancel.mockReset(); });
describe('合并确认与快照', () => {
  it('取消无提交，确认仅提交一次并选中原根，过期拒绝', async () => {
    const original = blankDesign();
    const { splitWall } = await import('../model/wallSplit');
    state.design = splitWall(original, 'outer-0', [300]).design;
    const callback = () => render().find(n => n.type === PropertyPanel)!.props.mergeWall as (id: string) => void;
    state.confirm.mockResolvedValue(false); callback()('outer-0'); await Promise.resolve(); expect(state.commit).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true); callback()('outer-0'); await Promise.resolve(); expect(state.commit).toHaveBeenCalledOnce();
    expect(state.values[0]).toEqual({ kind: 'wall', id: 'outer-0' });
    state.commit.mockClear(); let resolve!: (yes: boolean) => void; state.confirm.mockImplementation(() => new Promise<boolean>(r => { resolve = r; }));
    callback()('outer-0'); state.design = structuredClone(state.design!); resolve(true); await Promise.resolve(); expect(state.commit).not.toHaveBeenCalled();
  });
});
describe('分割墙段共享入口及快照提交', () => {
  const open = (entry: typeof PropertyPanel | typeof SelectionEditor = PropertyPanel) => {
    const canvas = render().find(n => n.type === PlanCanvas)!;
    (canvas.props.select as (s: unknown) => void)({ kind: 'wall', id: 'outer-0' });
    (render().find(n => n.type === entry)!.props.splitWall as (id: string) => void)('outer-0');
    return render().find(n => n.type === WallSplitDialog)!;
  };
  it('两个入口共用分割dialog，应用一次历史并选中指定段，取消不提交', () => {
    for (const entry of [PropertyPanel, SelectionEditor]) {
      state.values = []; state.commit.mockClear();
      const dialog = open(entry), before = state.design;
      expect(state.commit).not.toHaveBeenCalled();
      (dialog.props.onApply as (cuts: number[], selected: number) => void)([300, 800], 1);
      expect(state.commit).toHaveBeenCalledOnce(); expect(state.commit.mock.calls[0][1]).toBe(before);
      const next = state.commit.mock.calls[0][0] as Design;
      expect(next.walls).toHaveLength(6);
      expect(state.values[0]).toEqual({ kind: 'wall', id: next.walls[1].id });
      expect(render().some(n => n.type === WallSplitDialog)).toBe(false);
    }
    state.values = []; state.commit.mockClear(); (open().props.onClose as () => void)(); expect(state.commit).not.toHaveBeenCalled();
  });
  it('设计改变拒绝过期提交，已拆墙不能打开，3D入口隐藏', () => {
    const dialog = open(); state.design = structuredClone(state.design!);
    expect(() => (dialog.props.onApply as (cuts: number[], i: number) => void)([300], 0)).toThrow('设计已变化');
    expect(state.commit).not.toHaveBeenCalled(); expect(render().some(n => n.type === WallSplitDialog)).toBe(false);
    state.values = []; state.design!.demolished = ['outer-0']; expect(open()).toBeUndefined();
    state.values[2] = '3d'; expect(render().find(n => n.type === PropertyPanel)!.props.splitWall).toBeUndefined();
  });
});
describe('承重墙删除保护', () => {
  it('选中用户标记墙或其洞口后删除均不提交', () => {
    const d = blankDesign(); d.walls.push({ id: 'bearing', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240, loadBearing: true });
    d.openings.push({ id: 'door', wallId: 'bearing', kind: 'door', offset: 2000, width: 900 }); state.design = d;
    for (const selection of [{ kind: 'wall', id: 'bearing' }, { kind: 'opening', id: 'door' }]) {
      const canvas = render().find(n => n.type === PlanCanvas)!; (canvas.props.select as (s: unknown) => void)(selection);
      const editor = render().find(n => n.props.remove && n.props.selection)!; (editor.props.remove as () => void)();
      expect(state.change).not.toHaveBeenCalled();
    }
  });
});
describe('尺寸驱动墙体提交链', () => {
  const open = () => {
    const d = blankDesign(); d.walls.push({ id: 'partition', a: [3000, 0], b: [3000, d.depth], thickness: 240, kind: 'partition' });
    state.design = d;
    const segment = perimeterDimensions(d)!.chains.flatMap(c => c.segments).find(s => s.binding?.startWalls.includes('partition') && s.binding.endWalls.includes('outer-1'))!;
    const canvas = render().find(n => n.type === PlanCanvas)!;
    (canvas.props.onDimensionSelect as (s: DimensionSegment) => void)(segment);
    return d;
  };
  it('点选后只生成草稿，应用只commit一次整组快照，取消没有历史', () => {
    const before = open();
    expect(state.cancel).toHaveBeenCalledOnce(); expect(state.commit).not.toHaveBeenCalled();
    const dialog = render().find(n => n.type === DimensionEditDialog)!;
    (dialog.props.onApply as (n:number,side:string) => void)(2200, 'end');
    expect(state.commit).toHaveBeenCalledOnce(); expect(state.commit.mock.calls[0][1]).toBe(before);
    expect(render().some(n => n.type === DimensionEditDialog)).toBe(false);
    state.values = []; state.commit.mockClear(); open();
    (render().find(n => n.type === DimensionEditDialog)!.props.onClose as () => void)();
    expect(state.commit).not.toHaveBeenCalled();
  });
  it('设计改变或切换工具后对话框不再渲染，相同值不提交', () => {
    const before = open(), segment = perimeterDimensions(before)!.chains.flatMap(c => c.segments).find(s => s.binding?.startWalls.includes('partition') && s.binding.endWalls.includes('outer-1'))!;
    (render().find(n => n.type === DimensionEditDialog)!.props.onApply as (n:number,side:string)=>void)(segment.end - segment.start, 'end');
    expect(state.commit).not.toHaveBeenCalled();
    state.values = []; open(); state.design = { ...state.design! };
    expect(render().some(n => n.type === DimensionEditDialog)).toBe(false);
    state.values = []; open(); state.values[1] = 'wall';
    expect(render().some(n => n.type === DimensionEditDialog)).toBe(false);
  });
});
describe('2D 常用工具与更多菜单', () => {
  it('直接展示选择、绘墙、门、窗，并切换对应画布工具及选中态', () => {
    expect(tools(render()).filter(node => node.props.label && node.props.onClick).map(node => node.props.label)).toEqual(['选择', '绘墙', '门', '窗']);
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
    expect(tools(render()).filter(node => node.props.label && node.props.onClick).map(node => node.props.label)).toEqual(['选择']);
    state.values[2] = '3d';
    expect(tools(render()).filter(node => node.props.label && node.props.onClick).map(node => node.props.label)).toEqual(['鸟瞰', '漫游', '俯视', '剖切']);
    expect(tools(render()).some(node => node.props['aria-label'] === '更多')).toBe(false);
  });
});
