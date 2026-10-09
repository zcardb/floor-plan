import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, LibraryItem, Project } from '../model/types';

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], design: null as Design | null, furniture: [] as LibraryItem[], change: vi.fn(), commit: vi.fn(), cancel: vi.fn(), confirm: vi.fn() }));
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
vi.mock('../cloud/useFloorCatalog', () => ({ useFloorCatalog: () => ({ items: [], loading: false, error: '', load: async () => {}, save: async () => {} }) }));
vi.mock('../cloud/useWallCatalog', () => ({ useWallCatalog: () => ({ items: [], loading: false, error: '', load: async () => {}, save: async () => {} }) }));
vi.mock('../cloud/useOpeningCatalog', () => ({ useOpeningCatalog: () => ({ items: [], loading: false, error: '', load: async () => {}, save: async () => {} }) }));
vi.mock('../cloud/useSurfaceCatalogs', () => ({ useRoofCatalog: () => ({ items: [], loading: false, error: '', load: async () => {}, save: async () => {} }), useCeilingCatalog: () => ({ items: [], loading: false, error: '', load: async () => {}, save: async () => {} }) }));
vi.mock('../cloud/useFurnitureCatalog', () => ({ useFurnitureCatalog: () => ({ items: state.furniture, loading: false, error: '', hasMore: false, count: state.furniture.length, counts: {}, load: async () => {}, save: async () => {}, remove: async () => {}, reset: () => {} }) }));
vi.mock('../model/useDesign', () => ({ useDesign: () => ({
  design: state.design, current: { get current() { return state.design; } }, change: state.change, commit: state.commit, preview: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  counts: { undo: 0, redo: 0 }, sizeTransaction: { flush: vi.fn(), cancel: state.cancel },
}) }));
import { Workbench } from './Workbench';
import { initialSceneState } from './useSceneLifecycle';
import { blankDesign, referenceDesign } from '../data/templates';
import { PlanCanvas } from './PlanCanvas';
import { DimensionEditDialog } from './DimensionEditDialog';
import { WallSplitDialog } from './WallSplitDialog';
import { PropertyPanel } from './PropertyPanel';
import { SelectionEditor } from './SelectionEditor';
import { ProjectMenu } from './ProjectMenu';
import { Button } from '@/components/ui/button';
import { ExportMenu } from './ExportMenu';
import { AccountMenu } from './AccountMenu';
import { WorkbenchBanner } from './WorkbenchBanner';
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
function render(overrides: Partial<Parameters<typeof Workbench>[0]> = {}) {
  state.cursor = 0;
  const noop = vi.fn();
  return nodes(Workbench({
    project: { id: 'test', name: '测试', state: state.design } as Project,
    projectNavigation: { projectList: [], hasMore: false, listLoading: false, onOpen: noop, onLoadMore: noop, onRename: noop, onRemove: noop },
    update: noop, status: { kind: 'saved' as const, label: '' }, loggedIn: false, projects: noop, login: noop, logout: noop,
    cloudSave: noop, guestEdits: 0,
    ...overrides,
  }));
}
function tools(tree: Node[]) {
  const group = tree.find(node => node.props.className === 'tool-group')!;
  return nodes(group);
}
beforeEach(() => { state.values = []; state.cursor = 0; state.effects = []; state.design = blankDesign(); state.furniture = []; state.change.mockReset(); state.commit.mockReset(); state.cancel.mockReset(); });
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
    state.values[2] = { ...initialSceneState, view: '3d' }; expect(render().find(n => n.type === PropertyPanel)!.props.splitWall).toBeUndefined();
  });
});
describe('承重墙删除保护', () => {
  it('用户标记的承重墙删除不提交，墙上的门窗可以删除', () => {
    const d = blankDesign(); d.walls.push({ id: 'bearing', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240, loadBearing: true });
    d.openings.push({ id: 'door', wallId: 'bearing', kind: 'door', offset: 2000, width: 900 }); state.design = d;
    for (const [selection, removed] of [[{ kind: 'wall', id: 'bearing' }, false], [{ kind: 'opening', id: 'door' }, true]] as const) {
      state.change.mockClear();
      const canvas = render().find(n => n.type === PlanCanvas)!; (canvas.props.select as (s: unknown) => void)(selection);
      const editor = render().find(n => n.props.remove && n.props.selection)!; (editor.props.remove as () => void)();
      expect(state.change.mock.calls.length > 0).toBe(removed);
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
describe('2D 常用工具与顶部工具栏', () => {
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
  it('测量与拆改入口已移除，更多菜单只保留窄屏可用的破坏性操作', () => {
    const tree = tools(render());
    expect(text(tree.map(node => node.props.children as ReactNode))).not.toContain('测量距离');
    expect(text(tree.map(node => node.props.children as ReactNode))).not.toContain('拆改非承重墙');
    const more = tools(render()).find(node => node.props['aria-label'] === '更多')!;
    expect(more.props.className).toContain('compact-only');
    const items = tools(render()).filter(node => typeof node.props.onSelect === 'function');
    expect(items.map(item => text(item.props.children as ReactNode))).toEqual(['重置方案', '清空家具', '清空门窗', '清空分割', '清空承重']);
  });
  it('V、Esc 保留工具切换，M、X 不再切换工具', () => {
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
      key('x'); key('m');
      expect(state.values[1]).toBe('select');
      key('v');
      expect(state.values[1]).toBe('select');
      key('m', true);
      expect(state.values[1]).toBe('select');
      state.values[2] = { ...initialSceneState, view: '3d' };
      attach();
      key('x'); key('m');
      expect(state.values[1]).toBe('select');
      key('Escape');
      expect(state.values[1]).toBe('select');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('参考户型不开放绘墙和门窗，3D 保持原有工具', () => {
    state.design = referenceDesign();
    expect(tools(render()).filter(node => node.props.label && node.props.onClick).map(node => node.props.label)).toEqual(['选择']);
    const more = tools(render()).find(node => node.props['aria-label'] === '更多')!;
    expect(more.props.className).toContain('compact-only');
    state.values[2] = { ...initialSceneState, view: '3d' };
    expect(tools(render()).filter(node => node.props.label && node.props.onClick).map(node => node.props.label)).toEqual(['鸟瞰', '漫游', '俯视', '剖切']);
  });
});
describe('账号家具库并入左侧家具库', () => {
  const furnace = { catalogId: 'custom-furnace', name: '火炉', category: '客厅', type: 'stove', w: 1200, d: 400, height: 900, color: '#b7c4b0', price: 800 } as LibraryItem;
  const sofa = { ...furnace, catalogId: 'custom-sofa', name: '账号沙发' } as LibraryItem;
  const libraryNode = (loggedIn = true) => render({ loggedIn }).find(n => n.props.customItems !== undefined)!;
  const names = (node: Node) => (node.props.customItems as LibraryItem[]).map(item => item.name);
  it('登录后账号家具进入侧栏，与项目目录同 id 的只保留项目版本', () => {
    state.design = { ...blankDesign(), customCatalog: [sofa] };
    state.furniture = [sofa, furnace];
    expect(names(libraryNode())).toEqual(['账号沙发', '火炉']);
    expect(names(libraryNode(false))).toEqual(['账号沙发']);
  });
  it('账号家具放进画布时登记进项目目录，重复放置与内置家具都不登记', () => {
    const add = (item: LibraryItem) => (libraryNode().props.add as (item: LibraryItem) => void)(item);
    const applied = () => (state.change.mock.calls[state.change.mock.calls.length - 1][0] as (design: Design) => Design)(state.design!);
    add(furnace);
    const next = applied();
    expect(next.customCatalog?.map(item => item.catalogId)).toEqual(['custom-furnace']);
    expect(next.furniture.map(item => item.name)).toEqual(['火炉']);
    state.design = next; state.change.mockClear();
    add(furnace);
    expect(applied().customCatalog?.map(item => item.catalogId)).toEqual(['custom-furnace']);
    state.change.mockClear();
    add({ ...furnace, catalogId: 'stove:燃气灶', name: '燃气灶' });
    expect(applied().customCatalog?.map(item => item.catalogId)).toEqual(['custom-furnace']);
  });
});
describe('单行顶部工具栏', () => {
  it('只有一行工具栏：项目菜单在最左，视图、导出、账号在右；无帮助按钮和旧 header', () => {
    const tree = render();
    expect(tree.some(n => typeof n.props.className === 'string' && (n.props.className as string).includes('main-header'))).toBe(false);
    const toolbar = tree.find(n => n.props.className === 'main-toolbar')!;
    const inside = nodes(toolbar);
    const order = [ProjectMenu, ExportMenu, AccountMenu].map(type => inside.findIndex(n => n.type === type));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(nodes((toolbar.props.children as ReactNode[])[0])[0].type).toBe(ProjectMenu);
    expect(tree.some(n => n.props['aria-label'] === '操作帮助')).toBe(false);
    expect(tree.some(n => n.props['aria-label'] === '视图')).toBe(true);
    expect(tree.some(n => n.props['aria-label'] === '文件' || n.props['aria-label'] === '图层')).toBe(false);
    expect(tree.some(n => n.props.className === 'workspace-save-status' && n.props.role === 'status')).toBe(true);
  });
  it('小屏的重置方案与各清空操作在 2D「更多」菜单的 compact-only 项里', () => {
    const more = tools(render()).filter(n => typeof n.props.className === 'string' && (n.props.className as string).includes('compact-only') && n.props.onSelect);
    expect(more.map(n => text(n.props.children as ReactNode))).toEqual(['重置方案', '清空家具', '清空门窗', '清空分割', '清空承重']);
  });
  const dangerItems = () => nodes(render().find(n => n.props.className === 'tool-group danger-actions')!).filter(n => n.props.onSelect);
  const clearItem = (label: string) => dangerItems().find(n => text(n.props.children as ReactNode).startsWith(label))!;
  it('宽屏「清空」下拉合并四项清空操作，显示数量，无对象时禁用', () => {
    expect(dangerItems().map(n => text(n.props.children as ReactNode))).toEqual(['清空家具0', '清空门窗0', '清空分割0', '清空承重0']);
    expect(dangerItems().every(n => n.props.disabled === true)).toBe(true);
    expect(nodes(render().find(n => n.props.className === 'tool-group danger-actions')!).find(n => n.props['aria-label'] === '清空')!.props.disabled).toBe(true);
  });
  it('清空门窗：二次确认后删除全部门窗（含承重墙），保留墙体与家具', async () => {
    const reference = referenceDesign();
    state.design = reference;
    const clear = () => clearItem('清空门窗').props.onSelect as () => Promise<void>;
    state.confirm.mockResolvedValue(false);
    await clear()();
    expect(state.change).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true);
    await clear()();
    expect(state.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ confirmText: '清空门窗', tone: 'destructive' }));
    const next = (state.change.mock.calls[0][0] as (d: Design) => Design)(reference);
    expect(next.openings).toEqual([]);
    expect(next.walls).toBe(reference.walls);
    expect(next.furniture).toBe(reference.furniture);
  });
  it('清空分割：确认后把分割段合并回整段，取消则不提交', async () => {
    const { splitWall } = await import('../model/wallSplit');
    const base = blankDesign();
    state.design = splitWall(base, 'outer-0', [1000, 3000]).design;
    expect(text(clearItem('清空分割').props.children as ReactNode)).toBe('清空分割2');
    state.confirm.mockResolvedValue(false);
    await (clearItem('清空分割').props.onSelect as () => Promise<void>)();
    expect(state.commit).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true);
    await (clearItem('清空分割').props.onSelect as () => Promise<void>)();
    expect(state.commit).toHaveBeenCalledOnce();
    expect((state.commit.mock.calls[0][0] as Design).walls).toHaveLength(base.walls.length);
  });
  it('清空承重：确认后所有承重墙改为普通墙', async () => {
    const reference = referenceDesign();
    state.design = reference;
    expect(clearItem('清空承重').props.disabled).toBe(false);
    state.confirm.mockResolvedValue(true);
    await (clearItem('清空承重').props.onSelect as () => Promise<void>)();
    expect(state.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ confirmText: '清空承重' }));
    const next = (state.change.mock.calls[0][0] as (d: Design) => Design)(reference);
    expect(next.walls.some(w => w.kind === 'bearing' || w.loadBearing)).toBe(false);
  });
});

describe('游客改模版后的顶部提示条', () => {
  const banner = (tree: Node[]) => tree.find(n => n.type === WorkbenchBanner && n.props.label === '模版已更改');
  it('只有游客改过方案才出现', () => {
    expect(banner(render({ guestEdits: 1 }))).toBeDefined();
    expect(banner(render())).toBeUndefined();
    expect(banner(render({ guestEdits: 1, loggedIn: true }))).toBeUndefined();
  });
  it('主按钮触发登录保存，「暂不保存」只关掉当前版本', async () => {
    const cloudSave = vi.fn(async () => true);
    const buttons = nodes(banner(render({ guestEdits: 2, cloudSave }))!).filter(n => n.type === Button);
    const byText = (label: string) => buttons.find(b => text(b.props.children as ReactNode) === label)!;
    expect(buttons.map(b => text(b.props.children as ReactNode))).toEqual(['暂不保存', '登录并保存']);
    (byText('登录并保存').props.onClick as () => void)();
    await Promise.resolve();
    expect(cloudSave).toHaveBeenCalledOnce();
    (byText('暂不保存').props.onClick as () => void)();
    expect(banner(render({ guestEdits: 2, cloudSave }))).toBeUndefined();
    expect(banner(render({ guestEdits: 3, cloudSave }))).toBeDefined();
  });
});

describe('内置模板只读预览提示条', () => {
  const banner = (tree: Node[]) => tree.find(n => n.type === WorkbenchBanner && n.props.label === '只读预览');
  const builtin = () => ({ id: 'builtin:reference', name: '参考户型', state: state.design!, builtin: true, templateId: 'reference' } as unknown as Project);
  it('只在内置模板只读预览时出现，与游客提示条复用同一组件', () => {
    expect(banner(render({ project: builtin() }))).toBeDefined();
    expect(banner(render())).toBeUndefined();
  });
  it('「用此模板新建」按当前模板新建', async () => {
    const createFromTemplate = vi.fn(async () => true);
    const [create] = nodes(banner(render({ project: builtin(), createFromTemplate }))!).filter(n => n.type === Button);
    expect(text(create.props.children as ReactNode)).toBe('用此模板新建');
    (create.props.onClick as () => void)();
    await Promise.resolve();
    expect(createFromTemplate).toHaveBeenCalledWith('reference');
  });
});
