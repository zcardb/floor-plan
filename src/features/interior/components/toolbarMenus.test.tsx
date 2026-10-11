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
import { ExportMenu } from './ExportMenu';
import { SoftwareSoonItem } from './SoftwareSoonItem';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
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

describe('ExportMenu 与 Coming soon', () => {
  it('导出按钮为 outline，一级菜单：「按格式导出」标题下直接列 5 项并回调对应格式，分隔线下为其他软件', () => {
    const onExport = vi.fn(), tree = nodes(ExportMenu({ view: '2d', pending: false, onExport }));
    const button = tree.find(n => n.type === Button)!;
    expect(button.props.variant).toBe('outline');
    expect(text(button.props.children as ReactNode)).toBe('导出');
    const formats = items(tree);
    expect(formats.map(n => text(n.props.children as ReactNode))).toEqual(['PNG 平面图', 'PDF 矢量图', 'SVG 矢量图', 'DXF CAD 图纸', 'JSON 方案文件']);
    formats.forEach(n => (n.props.onSelect as () => void)());
    expect(onExport.mock.calls.map(c => c[0])).toEqual(['png', 'pdf', 'svg', 'dxf', 'json']);
    expect(tree.some(n => n.type === SoftwareSoonItem && n.props.label === '导出到其他软件')).toBe(true);
    expect(tree.some(n => n.type === DropdownMenuSubTrigger)).toBe(false);
    const headingAt = tree.findIndex(n => n.props.className === 'project-menu-heading' && n.props.children === '按格式导出');
    const separatorAt = tree.findIndex(n => n.type === DropdownMenuSeparator), softwareAt = tree.findIndex(n => n.type === SoftwareSoonItem);
    expect(headingAt).toBeGreaterThan(-1);
    expect(tree.indexOf(formats[0]!)).toBeGreaterThan(headingAt);
    expect(separatorAt).toBeGreaterThan(tree.indexOf(formats[4]!));
    expect(softwareAt).toBeGreaterThan(separatorAt);
    expect(text(nodes(ExportMenu({ view: '3d', pending: false, onExport })).filter(n => n.type === DropdownMenuItem)[0].props.children as ReactNode)).toBe('PNG 当前视角');
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
