import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, LibraryItem, Project } from '@/lib/floor-plan/types';

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
vi.mock('@/features/projects/hooks/use-projects', () => ({ isSaveProblem: () => false }));
vi.mock('@/features/account-library/hooks/use-account-library', () => ({ useAccountLibrary: () => ({ furniture: state.furniture, overrides: [], floors: [], walls: [], openings: [], roofs: [], ceilings: [], loading: false, error: '', load: async () => {}, reset: () => {} }) }));
vi.mock('@/features/ai-design/hooks/use-ai-catalog', () => ({ useAiCatalog: () => ({ catalog: { entries: [], byCode: new Map(), byId: new Map(), codeOf: () => undefined }, items: [], loading: false, error: '', reload: async () => {} }) }));
vi.mock('@/features/ai-design/hooks/use-room-ai', () => ({ useRoomAi: () => ({ toneOf: () => 'idle', open: vi.fn(), room: undefined }) }));
vi.mock('../hooks/use-design', () => ({ useDesign: () => ({
  design: state.design, current: { get current() { return state.design; } }, change: state.change, commit: state.commit, preview: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  counts: { undo: 0, redo: 0 }, sizeTransaction: { flush: vi.fn(), cancel: state.cancel },
}) }));
import { Workbench } from '../components/workbench';
import { initialSceneState } from '../hooks/use-scene-lifecycle';
import { blankDesign, referenceDesign } from '@/lib/floor-plan/templates';
import { PlanCanvas } from '../components/plan-canvas';
import { Library } from '../components/library';
import { PlanRailTools, SceneRailPanels, SceneRailTools, SceneViewMenu } from '../components/rail-tools';
import { CostChip } from '@/features/costs/components/cost-chip';
import { LayoutPanel, LayoutTidyButton } from '../components/layout-panel';
import { DimensionEditDialog, WallSplitDialog } from '../components/lazy-dialogs';
import { AiChatPanel } from '@/features/ai-design';
import { ReportPreview } from '@/features/report';
import { SidePanel } from '../components/side-panel';
import { CanvasRail, RailButton } from '../components/canvas-rail';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ViewMenu } from '../components/view-menu';
import { StylePanel } from '@/features/decor-styles/components/style-panel';
import { HouseSettingsPanel } from '../components/house-settings-panel';
import { CostPanel } from '@/features/costs/components/cost-panel';
import { SelectionEditor } from '../components/selection-editor';
import { ProjectMenu } from '@/features/projects/components/project-menu';
import { Logo } from '@/components/logo/logo';
import { Button } from '@/components/ui/button';
import { ExportMenu } from '../components/export-menu';
import { WorkbenchBanner } from '../components/workbench-banner';
import { type DimensionSegment, perimeterDimensions } from '@/lib/floor-plan/perimeter-dimensions';

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
    projectNavigation: { localProjects: [], onOpen: noop },
    update: noop, status: { kind: 'saved' as const, label: '' }, loggedIn: false, projects: noop, login: noop, logout: noop,
    cloudSave: noop, guestEdits: 0,
    ...overrides,
  }));
}
/** 侧栏默认收起：需要家具库的用例先通过竖条打开它（已打开则直接返回）。 */
function renderWithLibrary(overrides: Partial<Parameters<typeof Workbench>[0]> = {}) {
  const tree = render(overrides);
  if (tree.some(n => n.type === Library)) return tree;
  (tree.find(n => n.type === CanvasRail)!.props.onToggle as (kind: string) => void)('library');
  return render(overrides);
}
/** 展开竖条上的一段（工具段 / 侧栏段）：2D / 3D 各一套，由 RailTools 提供。 */
function railPart(tree: Node[], part: 'tools' | 'panels'): Node[] {
  const rail = tree.find(node => node.type === CanvasRail);
  const element = rail?.props[part] as ReactElement<Record<string, unknown>> | false | undefined;
  if (!element) return [];
  const restore = state.cursor;
  const out = nodes((element.type as (p: Record<string, unknown>) => ReactNode)(element.props));
  state.cursor = restore;
  return out;
}
/** 画布竖条上当前模式的工具段。 */
const tools = (tree: Node[]) => railPart(tree, 'tools');
/** 竖条按钮的短名，按显示顺序；带菜单的「墙体」「视图」以组件出现。 */
const railLabels = (tree: Node[]) => tree.flatMap(node =>
  node.type === RailButton ? [node.props.label as string]
    : typeof node.type === 'function' && (node.type as { name?: string }).name === 'RailWallMenu' ? ['墙体']
      : node.type === SceneViewMenu ? ['视图'] : []);
/** 竖条「墙」下拉里的条目。 */
function railWall(tree: Node[]): Node[] {
  const menu = tools(tree).find(node => typeof node.type === 'function' && (node.type as { name?: string }).name === 'RailWallMenu');
  if (!menu) return [];
  const restore = state.cursor;
  const out = nodes((menu.type as (props: unknown) => ReactNode)(menu.props));
  state.cursor = restore;
  return out;
}
beforeEach(() => { state.values = []; state.cursor = 0; state.effects = []; state.design = blankDesign(); state.furniture = []; state.change.mockReset(); state.commit.mockReset(); state.cancel.mockReset(); });
/** 模拟窄屏：侧栏以抽屉形式打开，画布工具条让位。 */
function stubDrawer(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: Number(query.match(/(\d+)/)?.[1] ?? 0) >= width,
    media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}
describe('合并确认与快照', () => {
  it('取消无提交，确认仅提交一次并选中原根，过期拒绝', async () => {
    const original = blankDesign();
    const { splitWall } = await import('@/lib/floor-plan/wall-split');
    state.design = splitWall(original, 'outer-0', [300]).design;
    const callback = () => render().find(n => n.type === SelectionEditor)!.props.mergeWall as (id: string) => void;
    state.confirm.mockResolvedValue(false); callback()('outer-0'); await Promise.resolve(); expect(state.commit).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true); callback()('outer-0'); await Promise.resolve(); expect(state.commit).toHaveBeenCalledOnce();
    expect(state.values[0]).toEqual({ kind: 'wall', id: 'outer-0' });
    state.commit.mockClear(); let resolve!: (yes: boolean) => void; state.confirm.mockImplementation(() => new Promise<boolean>(r => { resolve = r; }));
    callback()('outer-0'); state.design = structuredClone(state.design!); resolve(true); await Promise.resolve(); expect(state.commit).not.toHaveBeenCalled();
  });
});
describe('分割墙段共享入口及快照提交', () => {
  const open = (entry: typeof SelectionEditor = SelectionEditor) => {
    const canvas = render().find(n => n.type === PlanCanvas)!;
    (canvas.props.select as (s: unknown) => void)({ kind: 'wall', id: 'outer-0' });
    (render().find(n => n.type === entry)!.props.splitWall as (id: string) => void)('outer-0');
    return render().find(n => n.type === WallSplitDialog)!;
  };
  it('浮动工具条的分割入口：应用一次历史并选中指定段，取消不提交', () => {
    for (const entry of [SelectionEditor]) {
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
    state.values[2] = { ...initialSceneState, view: '3d' }; expect(render().find(n => n.type === SelectionEditor)!.props.splitWall).toBeUndefined();
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
  it('竖条按顺序给选择 / 墙体 ▾ / 门 / 窗，墙体下拉里是墙体工具与楼梯', () => {
    const railButtons = () => tools(render()).filter(node => node.type === RailButton);
    expect(railLabels(tools(render()))).toEqual(['选择', '墙体', '门', '窗']);
    expect(railWall(render()).length).toBeGreaterThan(0);
    for (const [label, tool] of [['选择', 'select'], ['门', 'door'], ['窗', 'window']] as const) {
      const button = railButtons().find(node => node.props.label === label)!;
      (button.props.onClick as () => void)();
      expect(state.values[1]).toBe(tool);
      expect(railButtons().find(node => node.props.label === label)!.props.active).toBe(true);
    }
    // 墙下拉：墙 / 垭口 / 房间分隔线（两行菜单项：标题 + 说明）、楼梯，以及窄屏才出现的重置 / 清空
    const items = railWall(render()).filter(node => node.type === DropdownMenuItem);
    expect(items.map(node => text(node.props.children as ReactNode))).toEqual([
      '墙点击起点与转角连续绘墙',
      '垭口无门扇的落地洞口',
      '房间分隔线不砌墙也能划分房间，不计价',
      '楼梯放到当前房间中央，选中后可换 L 型、U 型等',
      '重置方案',
      '清空家具',
      '清空门窗',
      '清空分割',
      '清空承重',
    ]);
    for (const tool of ['wall', 'passage', 'separator'] as const) {
      const item = railWall(render()).find(node => node.type === DropdownMenuItem && text(node.props.children as ReactNode).startsWith({ wall: '墙', passage: '垭口', separator: '房间分隔线' }[tool]))!;
      (item.props.onSelect as () => void)();
      expect(state.values[1]).toBe(tool);
    }
  });
  it('测量与拆改入口已移除；破坏性操作在窄屏收进竖条「墙」下拉', () => {
    const tree = render();
    const all = text(tree.map(node => node.props.children as ReactNode));
    expect(all).not.toContain('测量距离');
    expect(all).not.toContain('拆改非承重墙');
    const compact = railWall(tree).filter(node => typeof node.props.className === 'string' && (node.props.className as string).includes('compact-only') && node.props.onSelect);
    expect(compact.map(node => text(node.props.children as ReactNode))).toEqual(['重置方案', '清空家具', '清空门窗', '清空分割', '清空承重']);
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
  it('可编辑的参考户型（游客/复制项目）开放绘墙和门窗，3D 换成选择 / 漫游 / 视图，风格在侧栏组', () => {
    state.design = referenceDesign();
    const labels = () => railLabels(tools(render()));
    expect(labels()).toEqual(['选择', '墙体', '门', '窗']);
    expect(railWall(render()).length).toBeGreaterThan(0);
    expect(renderWithLibrary().find(n => n.type === Library)!.props.structureTools).toBe(true);
    state.values[2] = { ...initialSceneState, view: '3d' };
    expect(labels()).toEqual(['选择', '漫游', '视图']);
    expect(railLabels(railPart(render(), 'panels'))).toEqual(['风格']);
  });
  it('内置模板只读预览不开放绘墙和门窗，3D 仍有视图工具', () => {
    state.design = referenceDesign();
    const preview = () => renderWithLibrary({ project: { id: 'builtin', name: '模板', state: state.design, builtin: true } as Project });
    const labels = () => railLabels(tools(preview()));
    expect(labels()).toEqual(['选择']);
    // 只读预览：墙体下拉里全是写操作，整个隐藏
    expect(railWall(preview())).toEqual([]);
    expect(preview().find(n => n.type === Library)!.props.structureTools).toBe(false);
    state.values[2] = { ...initialSceneState, view: '3d' };
    expect(labels()).toEqual(['选择', '漫游', '视图']);
  });
});
describe('账号家具库并入左侧家具库', () => {
  const furnace = { catalogId: 'custom-furnace', name: '火炉', category: '客厅', type: 'stove', w: 1200, d: 400, height: 900, color: '#b7c4b0', price: 800 } as LibraryItem;
  const sofa = { ...furnace, catalogId: 'custom-sofa', name: '账号沙发' } as LibraryItem;
  const libraryNode = (loggedIn = true) => renderWithLibrary({ loggedIn }).find(n => n.props.customItems !== undefined)!;
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
  it('只有一行工具栏：品牌 logo 在最左，右侧只有保存', () => {
    const tree = render();
    expect(tree.some(n => typeof n.props.className === 'string' && (n.props.className as string).includes('main-header'))).toBe(false);
    const toolbar = tree.find(n => n.props.className === 'main-toolbar')!;
    const inside = nodes(toolbar);
    const order = [ProjectMenu, ViewMenu, ExportMenu].map(type => inside.findIndex(n => n.type === type));
    // 视图设置已移到底部缩放条，不再占据顶栏
    expect(order[1]).toBe(-1);
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[2]).toBeGreaterThan(order[0]);
    // 品牌 logo 现在在项目菜单的触发按钮里，两者是同一个点击区。
    expect(nodes((toolbar.props.children as ReactNode[])[0])[0].type).toBe(ProjectMenu);
    expect(inside.some(n => n.type === Logo)).toBe(false);
    // 全屏、头像、旧「视图」下拉与「选择」按钮都不再出现在顶栏
    expect(tree.some(n => n.props['aria-label'] === '全屏')).toBe(false);
    expect(tree.some(n => n.props['aria-label'] === '视图')).toBe(false);
    expect(tree.some(n => n.props['aria-label'] === '选择')).toBe(false);
    expect(tree.some(n => n.props['aria-label'] && String(n.props['aria-label']).startsWith('我的账号'))).toBe(false);
    expect(tree.some(n => n.props['aria-label'] === '操作帮助')).toBe(false);
    expect(tree.some(n => n.props.className === 'workspace-save-status')).toBe(false);
    expect(tree.some(n => n.props.className === 'status-bar')).toBe(false);
  });
  it('项目下拉底部有登录 / 退出登录，保存按钮文案固定「保存」', () => {
    const tree = render();
    const project = tree.find(n => n.type === ProjectMenu)!;
    expect(project.props.onLogin).toBeTypeOf('function');
    expect(project.props.onLogout).toBeTypeOf('function');
    expect(tree.find(n => n.type === ExportMenu)!.props.onSave).toBeTypeOf('function');
  });
  it('小屏的重置方案与各清空操作在竖条「墙」下拉的 compact-only 项里', () => {
    const more = railWall(render()).filter(n => typeof n.props.className === 'string' && (n.props.className as string).includes('compact-only') && n.props.onSelect);
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
    const { splitWall } = await import('@/lib/floor-plan/wall-split');
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

describe('编辑器分区：侧栏、竖条与画布', () => {
  const rail = (tree: Node[]) => tree.find(n => n.type === CanvasRail)!;
  const panel = (tree: Node[]) => tree.find(n => n.type === SidePanel);
  it('宽屏默认也不打开侧栏，竖条无高亮；点顶栏「家具」打开家具列表', () => {
    const tree = render();
    expect(panel(tree)).toBeUndefined();
    expect(rail(tree).props.sidePanel).toBeNull();
    const library = (tree: Node[]) => tree.find(n => n.type === 'button' && n.props['aria-label'] === '家具库')!;
    expect(library(tree).props['aria-pressed']).toBe(false);
    (library(tree).props.onClick as () => void)();
    const opened = render();
    expect(panel(opened)!.props.title).toBe('家具列表');
    expect(nodes(panel(opened)!).find(n => n.type === Library)).toBeDefined();
    expect(library(opened).props['aria-pressed']).toBe(true);
    // 视图设置现在是左下角缩放条里的第一个图标
    const zoom = tree.find(n => n.props.className === 'canvas-zoom')!;
    expect(nodes(zoom)[1].type).toBe(ViewMenu);
  });
  it('竖条再点「家具」收起已打开的侧栏；AI 侧栏入口隐藏但功能保留', () => {
    const tree = render();
    (rail(tree).props.onToggle as (kind: string) => void)('library');
    expect(panel(render())!.props.title).toBe('家具列表');
    (rail(render()).props.onToggle as (kind: string) => void)('library');
    expect(panel(render())).toBeUndefined();
    const reopened = render();
    (rail(reopened).props.onToggle as (kind: string) => void)('ai');
    expect(panel(render())!.props.title).toBe('AI 设计');
    expect(nodes(panel(render())!).find(n => n.type === AiChatPanel)).toBeDefined();
  });
  it('竖条打开对应侧栏：户型设置、方案与成本（方案总览已并入）、装修风格各有自己的面板', () => {
    const open = (kind: string) => {
      const tree = render();
      (rail(tree).props.onToggle as (k: string) => void)(kind);
      return render();
    };
    const settings = panel(open('settings'))!;
    expect(settings.props.title).toBe('户型设置');
    expect(nodes(settings).find(n => n.type === HouseSettingsPanel)).toBeDefined();
    // 成本与账号无关：游客（默认 loggedIn: false）也能打开；方案指标卡在成本面板顶部
    const cost = panel(open('cost'))!;
    expect(cost.props.title).toBe('方案与成本');
    expect(nodes(cost).find(n => n.type === CostPanel)).toBeDefined();
    const style = panel(open('style'))!;
    expect(style.props.title).toBe('装修风格');
    // 游客能换风格但不能新建；登录后才有新建入口
    expect(nodes(style).find(n => n.type === StylePanel)!.props).toMatchObject({ mine: [], onCreate: undefined });
    expect(render().find(n => n.type === SelectionEditor)!.props.showCosts).toBe(true);
  });
  it('竖条随 2D / 3D 换工具：2D 是绘制工具，3D 是视图工具，风格排在侧栏组', () => {
    const plan = rail(render()).props;
    expect((plan.tools as { type: unknown }).type).toBe(PlanRailTools);
    expect(plan.panels).toBeFalsy();
    state.values[2] = { ...initialSceneState, view: '3d' };
    const scene = rail(render()).props;
    expect((scene.tools as { type: unknown }).type).toBe(SceneRailTools);
    expect((scene.panels as { type: unknown }).type).toBe(SceneRailPanels);
  });
  it('3D「视图」菜单平铺斜视 / 俯视 / 剖切 / 夜景，开关写回场景选项', () => {
    state.values[2] = { ...initialSceneState, view: '3d' };
    const view = tools(render()).find(n => n.type === SceneViewMenu)!.props as { cut: boolean; night: boolean; onCut: (on: boolean) => void; onNight: (on: boolean) => void };
    expect(view).toMatchObject({ cut: false, night: false });
    // 测试里的 useState 只记录 setter 收到的值：找到被写入函数式更新的那一格，套到原值上验证结果
    const applied = (act: () => void) => {
      const before = [...state.values];
      act();
      const index = state.values.findIndex((value, i) => value !== before[i]);
      return (state.values[index] as (o: unknown) => Record<string, unknown>)(before[index]);
    };
    expect(applied(() => view.onNight(true))).toMatchObject({ night: true, cut: false });
    expect(applied(() => view.onCut(true))).toMatchObject({ cut: true });
  });
  it('顶栏右侧依次是家具、成本、保存；「生成方案报告」在保存下拉里，点开先预览', () => {
    const right = render().find(n => n.props.className === 'toolbar-right')!;
    const order = nodes(right).filter(n => n.type === CostChip || n.type === ExportMenu || (n.type === 'button' && n.props['aria-label'] === '家具库'));
    expect(order.map(n => n.type === CostChip ? '成本' : n.type === ExportMenu ? '保存' : '家具')).toEqual(['家具', '成本', '保存']);
    expect(render().some(n => n.type === ReportPreview)).toBe(false);
    (render().find(n => n.type === ExportMenu)!.props.onReport as () => void)();
    const preview = render().find(n => n.type === ReportPreview)!;
    expect(preview.props).toMatchObject({ exporting: false, onExport: expect.any(Function) });
    (preview.props.onClose as () => void)();
    expect(render().some(n => n.type === ReportPreview)).toBe(false);
  });
  it('左下角视图区有「布局整理」（带问题角标），只读预览不显示；点它先整理再打开布局整理侧栏', () => {
    const tidy = (tree: Node[]) => tree.find(n => n.type === LayoutTidyButton);
    expect(tidy(render())).toBeDefined();
    expect(tidy(render({ project: { id: 'builtin', name: '模板', state: state.design, builtin: true } as Project }))).toBeUndefined();
    (tidy(render())!.props.onTidy as () => void)();
    const opened = render().find(n => n.type === SidePanel)!;
    expect(opened.props.title).toBe('布局整理');
    expect(nodes(opened).find(n => n.type === LayoutPanel)!.props.lastTidy).toEqual({ adjusted: [], unresolved: [] });
  });
  it('绘墙模式显示「完成绘墙」提示并能回到选择工具，画布上不再渲染状态条 / 比例尺 / 左上角文案', () => {
    const tree = render();
    state.values[1] = 'wall';
    const wall = render();
    const hint = wall.find(n => n.props.className === 'mode-hint')!;
    expect(nodes(hint).some(n => n.props.className === 'mode-hint-finish')).toBe(true);
    (nodes(hint).find(n => n.props.className === 'mode-hint-finish')!.props.onClick as () => void)();
    expect(state.values[1]).toBe('select');
    for (const cls of ['status-bar', 'scale-bar', 'canvas-context', 'stage-topline', 'stage-pane-buttons', 'mobile-library'])
      expect(tree.some(n => n.props.className === cls)).toBe(false);
    expect(tree.find(n => n.type === PlanCanvas)!.props.onCoord).toBeUndefined();
    expect(tree.some(n => n.props['aria-label'] === '适应窗口')).toBe(true);
  });
  it('窄屏（≤1100px）默认不弹侧栏，打开后画布工具条让位，画布交互会收起抽屉', () => {
    stubDrawer(1100);
    try {
      const tree = render();
      expect(panel(tree)).toBeUndefined();
      (rail(tree).props.onToggle as (kind: string) => void)('library');
      const openTree = render();
      expect(panel(openTree)).toBeDefined();
      expect(openTree.find(n => n.type === SelectionEditor)!.props.hidden).toBe(true);
      expect(openTree.some(n => n.props.className === 'drawer-backdrop')).toBe(true);
      (openTree.find(n => n.type === PlanCanvas)!.props.closePanels as () => void)();
      expect(panel(render())).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});
