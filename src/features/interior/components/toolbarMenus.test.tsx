import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, refs: [] as { current: unknown }[], effects: [] as (() => unknown)[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useRef: (value: unknown) => { const ref = { current: value }; state.refs.push(ref); return ref; },
  useEffect: (effect: () => unknown) => { state.effects.push(effect); },
  useCallback: <T,>(fn: T) => fn,
}));
import { ProjectMenu, LoadMoreSentinel } from './ProjectMenu';
import { ProjectDeleteDialog, ProjectRenameDialog } from './ProjectDialogs';
import { NewProjectDialog } from './NewProjectDialog';
import { AiCreateProjectDialog } from './AiCreateProjectDialog';
import { CreateProjectMenuItems, type CreateProjectActions } from './CreateProjectMenuItems';
import { Logo } from './Logo';
import { ProjectRowActions } from './ProjectRowActions';
import { AccountMenu } from './AccountMenu';
import { AccountAvatar } from './AccountAvatar';
import { ExportMenu, saveState } from './ExportMenu';
import { SoftwareSoonItem } from './SoftwareSoonItem';
import { CollectionMenu, LAYER_ITEMS } from './CollectionMenu';
import { SidePanel } from './SidePanel';
import { CanvasRail } from './CanvasRail';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { LogIn } from 'lucide-react';
import type { ProjectSummary } from '../cloud/useProjects';

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
const row = (id: string, name: string, system = false): ProjectSummary => ({ id, name, updatedAt: '2026-10-08T08:00:00Z', revision: 0, cloud: true, system });
const current = row('a', '三室两厅两卫'), other = row('b', 'Home');
function menu(overrides: Partial<Parameters<typeof ProjectMenu>[0]> = {}) {
  state.cursor = 0;
  const props = {
    project: current, loggedIn: true, projectList: [current, other], hasMore: false, listLoading: false,
    onOpen: vi.fn(async () => true), onLoadMore: vi.fn(), onBack: vi.fn(),
    onRename: vi.fn(async () => true), onRemove: vi.fn(async () => true), ...overrides,
  };
  return { props, tree: nodes(ProjectMenu(props)) };
}
const items = (tree: Node[]) => tree.filter(n => n.type === DropdownMenuItem);
const options = (tree: Node[]) => items(tree).filter(n => n.props.className === 'project-menu-option');
/** 新建方式条目（图标块 + 标题 + 说明）。 */
const createOptions = (tree: Node[]) => tree.filter(n => typeof n.props.title === 'string' && typeof n.props.onSelect === 'function');
const actions = (tree: Node[]) => tree.filter(n => n.type === ProjectRowActions);
beforeEach(() => { state.values = []; state.cursor = 0; state.refs = []; state.effects = []; });

describe('ProjectMenu', () => {
  it('触发器是 logo + 项目名；窄下拉只有三项：返回项目管理 → 新建项目 ▸ → 切换项目 ▸，项目列表在切换的二级菜单里', () => {
    const { props, tree } = menu({ onCreateProject: vi.fn(async () => true) });
    const trigger = tree.find(n => n.props.className === 'project-menu-trigger')!;
    expect(nodes(trigger).some(n => n.type === Logo)).toBe(true);
    expect(trigger.props['aria-label']).toBe('项目：三室两厅两卫');
    expect(text(nodes(trigger).find(n => n.props.className === 'project-menu-title')!.props.children as ReactNode)).toBe('三室两厅两卫');
    const all = items(tree), back = all[0]!, rows = options(tree);
    expect(text(back.props.children as ReactNode)).toBe('返回项目管理');
    const subs = tree.filter(n => n.type === DropdownMenuSubTrigger);
    expect(subs.map(n => text(n.props.children as ReactNode))).toEqual(['新建项目', '切换项目']);
    expect(tree.indexOf(subs[0]!)).toBeGreaterThan(tree.indexOf(back));
    const switchMenu = tree.filter(n => n.type === DropdownMenuSubContent)[1]!;
    expect(nodes(switchMenu.props.children as ReactNode).filter(n => n.props.className === 'project-menu-option')).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(tree.some(n => n.type === AccountAvatar)).toBe(false);
    expect(rows[0].props['aria-current']).toBe('true');
    expect(nodes(rows[0]).some(n => n.props['aria-label'] === '当前项目')).toBe(true);
    expect(nodes(rows[1]).some(n => n.props['aria-label'] === '当前项目')).toBe(false);
    expect(text(rows[1].props.children as ReactNode)).toContain('10/08');
    (back.props.onSelect as () => void)();
    expect(props.onBack).toHaveBeenCalledOnce();
  });
  it('点击其他项目切换，当前项不可再点', () => {
    const { props, tree } = menu();
    const [mine, theirs] = options(tree);
    const event = { preventDefault: vi.fn() };
    (mine.props.onSelect as (e: typeof event) => void)(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
    (theirs.props.onSelect as (e: typeof event) => void)({ preventDefault: vi.fn() });
    expect(props.onOpen).toHaveBeenCalledWith(other);
    expect(state.values[0]).toBe('b');
    expect(options(menu().tree).every(n => n.props.disabled === !n.props['aria-current'])).toBe(true);
  });
  it('有下一页时渲染底部哨兵，加载中显示 spinner', () => {
    expect(menu().tree.some(n => n.type === LoadMoreSentinel)).toBe(false);
    const { props, tree } = menu({ hasMore: true });
    const sentinel = tree.find(n => n.type === LoadMoreSentinel)!;
    expect(sentinel.props.onVisible).toBe(props.onLoadMore);
    expect(menu({ hasMore: true, listLoading: true }).tree.some(n => n.props.className === 'project-menu-loading')).toBe(true);
  });
  it('底部账号区：游客是「登录」，已登录是邮箱 +「退出登录」', () => {
    const onLogin = vi.fn(), onLogout = vi.fn();
    const guest = items(menu({ loggedIn: false, onLogin, email: undefined }).tree);
    const login = guest.find(n => text(n.props.children as ReactNode) === '登录')!;
    (login.props.onSelect as () => void)();
    expect(onLogin).toHaveBeenCalledOnce();
    const mineTree = menu({ email: '1879385@qq.com', onLogout, onLogin }).tree, mine = items(mineTree);
    expect(text(mineTree.find(n => n.props.className === 'project-menu-email')!.props.children as ReactNode)).toBe('1879385@qq.com');
    expect(mine.some(n => text(n.props.children as ReactNode) === '登录')).toBe(false);
    const logout = mine.find(n => text(n.props.children as ReactNode).includes('退出登录'))!;
    (logout.props.onSelect as () => void)();
    expect(onLogout).toHaveBeenCalledOnce();
    expect(items(menu({ email: 'a@b.c', onLogout, loggingOut: true }).tree).find(n => text(n.props.children as ReactNode).includes('退出登录'))!.props.disabled).toBe(true);
    expect(menu({ loggedIn: false, onLogin }).tree.some(n => n.props.className === 'project-menu-email')).toBe(false);
  });
  it('访客显示当前户型名称，可切换传入的模板，没有云保存与返回项目管理', () => {
    const { tree } = menu({ loggedIn: false });
    expect(text(tree.find(n => n.props.className === 'project-menu-trigger')!.props.children as ReactNode)).toBe(current.name);
    const labels = items(tree).map(n => text(n.props.children as ReactNode));
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain(current.name);
    expect(labels[1]).toContain(other.name);
    expect(labels).not.toContain('保存到云端');
    expect(labels).not.toContain('返回项目管理');
    expect(actions(tree)).toHaveLength(0);
  });
  it('项目行只有名称、日期与当前勾选，不再放重命名 / 删除（只在项目管理页操作）', () => {
    const { tree } = menu({ projectList: [current, other, row('s', '默认方案', true)] });
    expect(actions(tree)).toHaveLength(0);
    expect(tree.some(n => n.type === ProjectRenameDialog || n.type === ProjectDeleteDialog)).toBe(false);
    expect(options(tree)).toHaveLength(3);
  });
  it('系统默认方案在共享按钮里禁用重命名与删除，复制仅在传入时显示', () => {
    const buttons = (r: ProjectSummary, onDuplicate?: () => void) =>
      nodes(ProjectRowActions({ row: r, disabled: false, onRename: vi.fn(), onDelete: vi.fn(), onDuplicate })).filter(n => n.type === Button);
    expect(buttons(row('s', '默认方案', true)).map(n => n.props.disabled)).toEqual([true, true]);
    expect(buttons(other, vi.fn()).map(n => n.props['aria-label'])).toEqual(['重命名Home', '复制Home', '删除Home']);
  });
  it('切换项目进行中时返回与新建入口禁用', () => {
    state.values[0] = 'b';
    const tree = menu({ onCreateProject: vi.fn(async () => true) }).tree;
    expect(items(tree)[0]!.props.disabled).toBe(true);
    expect(tree.find(n => n.type === DropdownMenuSubTrigger)!.props.disabled).toBe(true);
  });
  it('新建项目为悬停子菜单，选项与项目管理页一致；点击选项才打开对应弹窗', () => {
    const isCreate = (n: Node) => n.type === DropdownMenuSubTrigger && text(n.props.children as ReactNode) === '新建项目';
    expect(menu().tree.some(isCreate)).toBe(false);
    const onCreateProject = vi.fn(async () => true);
    const { tree } = menu({ onCreateProject });
    expect(tree.find(isCreate)!.props.className).toBe('project-menu-entry');
    const options = tree.find(n => n.type === DropdownMenuSubContent)!;
    const shared = nodes(options.props.children as ReactNode).find(n => n.type === CreateProjectMenuItems)!;
    const actions = shared.props.actions as CreateProjectActions;
    expect(actions.ai).toBeTypeOf('function');
    expect(menu({ onCreateProject }).tree.find(n => n.type === NewProjectDialog)!.props.open).toBe(false);
    actions.blank();
    expect(menu({ onCreateProject }).tree.find(n => n.type === NewProjectDialog)!.props.open).toBe(true);
    expect(menu({ onCreateProject }).tree.some(n => n.type === AiCreateProjectDialog)).toBe(true);
    expect(menu({ onCreateProject, loggedIn: false }).tree.some(isCreate)).toBe(false);
  });
  it('共享的新建选项：手动创建、AI 创建（可选）、导入 DXF、其他软件 Coming soon', () => {
    const actions = { blank: vi.fn(), ai: vi.fn(), importFile: vi.fn() };
    const tree = nodes(CreateProjectMenuItems({ actions }));
    const labels = createOptions(tree).map(n => n.props.title);
    expect(labels).toEqual(['手动创建', 'AI 创建…', '导入 DXF 图纸…']);
    expect(createOptions(tree).every(n => typeof n.props.hint === 'string' && n.props.hint)).toBe(true);
    expect(tree.some(n => n.type === SoftwareSoonItem && n.props.label === '从其他软件导入')).toBe(true);
    createOptions(tree).forEach(n => (n.props.onSelect as () => void)());
    expect([actions.blank, actions.ai, actions.importFile].every(f => f.mock.calls.length === 1)).toBe(true);
    expect(createOptions(nodes(CreateProjectMenuItems({ actions: { ...actions, ai: undefined } }))).map(n => n.props.title)).not.toContain('AI 创建…');
  });
  it('新建菜单用到的 class 在 index.css 里都有定义，保持两行刻度（曾因整段 CSS 被删而塌成一行大图标）', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.create-menu')).toContain('width:min(260px');
    expect(rule('.create-menu [role="menuitem"].create-option')).toContain('min-height:48px');
    expect(rule('.create-option-icon>svg')).toContain('width:16px');
    expect(rule('.create-option-text>b')).toContain('font-size:var(--fs-group)');
    expect(rule('.create-option-text>small')).toContain('font-size:var(--fs-hint)');
    expect(rule('.create-menu [role="menuitem"].soon-item')).toContain('padding:0 9px');
    expect(rule('.ai-icon')).toContain('color:hsl(var(--primary))');
  });
  it('复刻当前项目是子菜单里的第二项，只在可复刻时出现，点击复刻当前项目', () => {
    const onCreateProject = vi.fn(async () => true);
    const submenuActions = (overrides: Partial<Parameters<typeof ProjectMenu>[0]> = {}) => {
      const { tree } = menu({ onCreateProject, ...overrides });
      const shared = nodes(tree.find(n => n.type === DropdownMenuSubContent)!.props.children as ReactNode).find(n => n.type === CreateProjectMenuItems)!;
      return shared.props.actions as CreateProjectActions;
    };
    expect(items(menu().tree).some(n => text(n.props.children as ReactNode) === '复制当前项目')).toBe(false);
    expect(submenuActions().duplicate).toBeUndefined();
    const labels = createOptions(nodes(CreateProjectMenuItems({ actions: submenuActions({ onDuplicate: vi.fn(async () => true) }) })))
      .map(n => n.props.title);
    expect(labels.slice(0, 2)).toEqual(['手动创建', '复刻当前项目']);
    const onDuplicate = vi.fn(async () => true);
    const actions = submenuActions({ onDuplicate });
    actions.duplicate!();
    expect(onDuplicate).toHaveBeenCalledWith(current);
  });
});

describe('LoadMoreSentinel', () => {
  it('滚到底触发加载，禁用时不监听', () => {
    const observers: { callback: IntersectionObserverCallback; disconnect: () => void }[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(public callback: IntersectionObserverCallback) { observers.push(this as never); }
      observe() {} disconnect() {}
    });
    try {
      const onVisible = vi.fn();
      LoadMoreSentinel({ disabled: false, onVisible });
      state.refs[0].current = { parentElement: {} };
      state.effects.forEach(effect => effect());
      expect(observers).toHaveLength(1);
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      expect(onVisible).toHaveBeenCalledOnce();
      state.refs = []; state.effects = [];
      LoadMoreSentinel({ disabled: true, onVisible });
      state.refs[0].current = { parentElement: {} };
      state.effects.forEach(effect => effect());
      expect(observers).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('AccountMenu', () => {
  it('登录后只显示圆形头像，菜单含名称、邮箱全文与退出登录', () => {
    const onLogout = vi.fn();
    const tree = nodes(AccountMenu({ email: '1879385@qq.com', loggedIn: true, onLogin: vi.fn(), onLogout }));
    const trigger = tree.find(n => n.props.className === 'account-trigger')!;
    expect(nodes(trigger.props.children as ReactNode).map(n => n.type)).toEqual([AccountAvatar]);
    expect(trigger.props['aria-label']).toBe('我的账号：1879385');
    const head = tree.find(n => n.props.className === 'account-menu-head')!;
    expect(text(head.props.children as ReactNode)).toBe('18793851879385@qq.com');
    (items(tree).find(n => text(n.props.children as ReactNode).includes('退出登录'))!.props.onSelect as () => void)();
    expect(onLogout).toHaveBeenCalledOnce();
  });
  it('访客显示登录按钮', () => {
    const onLogin = vi.fn(), tree = nodes(AccountMenu({ loggedIn: false, onLogin, onLogout: vi.fn() }));
    expect(tree[0].type).toBe(Button);
    expect(text(tree[0].props.children as ReactNode)).toBe('登录');
  });
});

describe('ExportMenu 保存状态与导出', () => {
  const menu = (overrides: Partial<Parameters<typeof ExportMenu>[0]> = {}) => {
    const onExport = vi.fn(), onSave = vi.fn();
    const props = { view: '2d' as const, pending: false, onExport, onSave, status: { kind: 'saved' as const, label: '云端已保存' }, loggedIn: true, ...overrides };
    return { props, tree: nodes(ExportMenu(props)), onExport, onSave };
  };
  it('文案固定「保存」，下拉第一行是状态，其下是可用的 5 种导出格式', () => {
    const { tree, onExport } = menu();
    const button = tree.find(n => n.type === Button)!;
    expect(text(button.props.children as ReactNode)).toContain('保存');
    expect(text(button.props.children as ReactNode)).not.toContain('导出');
    const status = tree.find(n => n.props.className?.toString().startsWith('save-menu-status'))!;
    expect(text(status.props.children as ReactNode)).toContain('云端已保存');
    const formats = items(tree);
    expect(formats.map(n => text(n.props.children as ReactNode))).toEqual(['PNG 平面图', 'PDF 矢量图', 'SVG 矢量图', 'DXF CAD 图纸', 'JSON 方案文件']);
    formats.forEach(n => (n.props.onSelect as () => void)());
    expect(onExport.mock.calls.map(c => c[0])).toEqual(['png', 'pdf', 'svg', 'dxf', 'json']);
    expect(tree.some(n => n.type === SoftwareSoonItem && n.props.label === '导出到其他软件')).toBe(true);
    expect(text(nodes(ExportMenu({ ...menu().props, view: '3d' })).filter(n => n.type === DropdownMenuItem)[0].props.children as ReactNode)).toBe('PNG 当前视角');
  });
  it('状态标记：已保存无标记、待保存带小圆点与「立即保存」、失败用错误色、导出中转圈', () => {
    expect(saveState({ status: { kind: 'saved', label: '云端已保存' }, loggedIn: true })).toEqual({ mark: 'none', label: '云端已保存', action: null, problem: false });
    expect(saveState({ status: { kind: 'dirty', label: '有待保存更改' }, loggedIn: true })).toEqual({ mark: 'dirty', label: '有待保存更改', action: '立即保存', problem: false });
    expect(saveState({ status: { kind: 'error', label: '云端保存失败' }, loggedIn: true })).toMatchObject({ mark: 'error', action: '立即保存', problem: true });
    expect(saveState({ status: { kind: 'conflict', label: '版本冲突，请另存' }, loggedIn: true }).mark).toBe('error');
    expect(saveState({ status: { kind: 'saved', label: '本机已保存' }, loggedIn: false, guestDirty: true }).mark).toBe('dirty');
    expect(saveState({ status: { kind: 'dirty', label: '有待保存更改' }, loggedIn: true, saving: true }).mark).toBe('busy');
    expect(saveState({ status: { kind: 'saved', label: '' }, loggedIn: true, pending: true }).mark).toBe('busy');
    expect(saveState({ status: { kind: 'saved', label: '' }, loggedIn: false, readOnly: true })).toMatchObject({ mark: 'none', label: '内置模板 · 只读', action: null });
  });
  it('登录用户有待保存项时可立即保存，游客看到「登录并保存」，只读模板无动作', () => {
    const { tree, onSave } = menu({ status: { kind: 'dirty', label: '有待保存更改' } });
    const action = items(tree).find(n => n.props.className === 'save-menu-action')!;
    expect(text(action.props.children as ReactNode)).toBe('立即保存');
    (action.props.onSelect as () => void)();
    expect(onSave).toHaveBeenCalledOnce();
    const guest = menu({ loggedIn: false, guestDirty: true, status: { kind: 'saved', label: '本机已保存' } }).tree;
    expect(text(guest.find(n => n.props.className === 'save-menu-action')!.props.children as ReactNode)).toBe('登录并保存');
    expect(guest.some(n => n.type === LogIn)).toBe(true);
    const readOnly = menu({ readOnly: true, status: { kind: 'saved', label: '内置模板 · 只读' } }).tree;
    expect(items(readOnly).some(n => n.props.className === 'save-menu-action')).toBe(false);
    expect(text(readOnly.find(n => n.props.className === 'save-menu-status')!.props.children as ReactNode)).toContain('内置模板 · 只读');
  });
  it('其他软件入口直接禁用、不展开子菜单，悬停提示 Coming soon', () => {
    const tree = nodes(SoftwareSoonItem({ label: '从其他软件导入' }));
    expect(tree[0].type).toBe(EditorTooltip);
    expect(tree[0].props).toMatchObject({ label: 'Coming soon', disabled: true });
    const item = tree.find(n => n.type === DropdownMenuItem)!;
    expect(item.props.disabled).toBe(true);
    expect(text(item.props.children as ReactNode)).toBe('从其他软件导入');
    expect(tree.some(n => n.type === DropdownMenuSubTrigger)).toBe(false);
  });
});

describe('集合菜单 CollectionMenu', () => {
  const render = (overrides: Partial<Parameters<typeof CollectionMenu>[0]> = {}) => {
    const props = {
      layers: { dims: true, labels: true, furn: true, grid: false, bearing: true, snap: true },
      view: '2d' as const, active: null, loggedIn: true,
      onToggleLayer: vi.fn(), onRatio: vi.fn(), onOpen: vi.fn(), ...overrides,
    };
    return { props, tree: nodes(CollectionMenu(props)) };
  };
  it('触发器是立方体图标按钮，平铺顺序为 视图 / 家具库 / 户型设置 / 方案总览 / 成本，无分组标题', () => {
    const { tree } = render();
    expect(tree.find(n => n.props['aria-label'] === '集合')!.props.className).toContain('collection-trigger');
    const top = tree.filter(n => n.type === DropdownMenuItem && n.props.className === 'project-menu-entry');
    expect(top.map(n => text(n.props.children as ReactNode))).toEqual(['家具库', '户型设置', '方案总览', '成本']);
    expect(tree.filter(n => n.type === DropdownMenuSubTrigger).map(n => text(n.props.children as ReactNode))).toEqual(['视图']);
    expect(tree.some(n => n.props.className === 'project-menu-heading')).toBe(false);
    expect(text(tree.map(n => n.props.children as ReactNode))).not.toContain('AI 模式');
  });
  it('视图二级菜单：6 个图层开关加 2 个显示比例，勾选不关菜单并写回图层', () => {
    const { props, tree } = render();
    const sub = tree.filter(n => n.type === DropdownMenuSubContent)[0]!;
    const items = nodes(sub.props.children as ReactNode).filter(n => n.type === DropdownMenuItem);
    expect(items.slice(0, 6).map(n => text(n.props.children as ReactNode))).toEqual(LAYER_ITEMS.map(([, label]) => label));
    expect(items.slice(6).map(n => text(n.props.children as ReactNode))).toEqual(['显示比例 1:60', '显示比例 1:100']);
    const grid = items.find(n => text(n.props.children as ReactNode) === '辅助网格')!;
    const event = { preventDefault: vi.fn() };
    (grid.props.onSelect as (e: typeof event) => void)(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(props.onToggleLayer).toHaveBeenCalledWith('grid');
    expect(nodes(grid).some(n => n.props.className === 'layer-checkbox')).toBe(true);
    (items[7].props.onSelect as () => void)();
    expect(props.onRatio).toHaveBeenCalledWith(100);
    expect(render({ view: '3d' }).tree.find(n => text(n.props.children as ReactNode) === '显示比例 1:60')!.props.disabled).toBe(true);
  });
  it('「成本」打开成本侧栏，当前打开的项高亮；游客只有 视图 / 家具库', () => {
    const { props, tree } = render({ active: 'cost' });
    const cost = tree.find(n => n.props.className === 'project-menu-entry' && text(n.props.children as ReactNode) === '成本')!;
    expect(cost.props['data-active']).toBe(true);
    (cost.props.onSelect as () => void)();
    expect(props.onOpen).toHaveBeenCalledWith('cost');
    const guest = render({ loggedIn: false }).tree;
    expect(guest.filter(n => n.type === DropdownMenuItem && n.props.className === 'project-menu-entry').map(n => text(n.props.children as ReactNode))).toEqual(['家具库']);
    expect(guest.filter(n => n.type === DropdownMenuSubTrigger)).toHaveLength(1);
  });
});

describe('统一侧栏与画布竖条', () => {
  it('侧栏有标题与关闭按钮，内容包在可滚动区里；只读时整体禁用', () => {
    const onClose = vi.fn();
    const tree = nodes(SidePanel({ title: '家具库', onClose, children: '内容' }));
    const panel = tree.find(n => n.props.className === 'side-panel')!;
    expect(text(panel).includes('家具库')).toBe(true);
    expect(nodes(panel).find(n => n.props.className === 'panel-scroll')).toBeDefined();
    expect(nodes(panel).find(n => n.props.disabled === false)).toBeDefined();
    (tree.find(n => n.props['aria-label'] === '关闭侧栏')!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
    expect(nodes(SidePanel({ title: '成本', readOnly: true, onClose: vi.fn(), children: 'x' })).find(n => n.props.disabled === true)).toBeDefined();
  });
  it('竖条只有家具与 AI 两个按钮，没有选择 / 编辑按钮；打开项高亮，再点同一个关闭', () => {
    const onToggle = vi.fn();
    const stage = { current: null };
    const tree = nodes(CanvasRail({ sidePanel: 'library', stage, onToggle }));
    const labels = tree.filter(n => n.type === 'button' && typeof n.props['aria-label'] === 'string').map(n => n.props['aria-label']);
    expect(labels).toEqual(['拖动工具条', '家具', 'AI 模式']);
    expect(labels).not.toContain('选择');
    const rail = tree.find(n => n.props.className === 'canvas-rail')!;
    expect(nodes(rail).filter(n => n.type === 'button').map(n => n.props.className)).toEqual(['canvas-rail-grip', 'canvas-rail-button active', 'canvas-rail-button']);
    expect(nodes(rail).find(n => n.props['aria-label'] === '家具')!.props['aria-pressed']).toBe(true);
    (nodes(rail).find(n => n.props['aria-label'] === 'AI 模式')!.props.onClick as () => void)();
    expect(onToggle).toHaveBeenCalledWith('ai');
    const grip = nodes(rail).find(n => n.props.className === 'canvas-rail-grip')!;
    expect(typeof grip.props.onPointerDown).toBe('function');
    expect(typeof grip.props.onKeyDown).toBe('function');
  });
});
