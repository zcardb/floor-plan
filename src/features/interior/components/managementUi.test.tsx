import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// 列表接口在服务端渲染里不会返回：由用例直接指定接口已返回的数据（见 usePagedList.testing）。
vi.mock('@/hooks/usePagedList', () => import('@/hooks/usePagedList.testing'));
vi.mock('../cloud/projectPages', () => ({ projectPage: vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 }, counts: {} })), backfillThumbnails: vi.fn(async () => 0) }));
vi.mock('../cloud/libraryPages', () => ({ accountItemPage: vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 }, counts: {} })), readBuiltinOverrides: vi.fn(async () => []) }));
vi.mock('../cloud/useFurnitureImage',()=>({useFurnitureImage:()=>({image:'',busy:false,error:'',generate:vi.fn(),cancel:vi.fn()})}));
// 识别确认弹窗走 Portal，服务端渲染不出内容：换成一个标记，并让导入流程的状态可由用例指定。
const importState = vi.hoisted(() => ({ drawing: null as null | { source: unknown; name: string } }));
vi.mock('../cloud/accountWrites', () => ({ saveAccountFurniture: vi.fn(), removeAccountFurniture: vi.fn(), accountMaterialSaves: { floor: vi.fn(), opening: vi.fn(), wall: vi.fn(), roof: vi.fn(), ceiling: vi.fn() } }));
vi.mock('./DxfImportDialog', () => ({ DxfImportDialog: ({ defaultName }: { defaultName: string }) => createElement('div', { 'data-dxf-import': defaultName }) }));
vi.mock('./useProjectImport', async original => {
  const actual = await original<typeof import('./useProjectImport')>();
  return { useProjectImport: (...args: Parameters<typeof actual.useProjectImport>) => ({ ...actual.useProjectImport(...args), ...(importState.drawing ? { drawing: importState.drawing } : {}) }) };
});
import { ManagementLoading } from './ManagementLoading';
import { ProjectManager } from './ProjectManager';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { CmsSearchField } from './CmsSearchField';
import type { useProjects, ProjectSummary } from '../cloud/useProjects';
import { TEMPLATE_PRESETS, createProject } from '../data/templates';
import { mineCardActions, templateCardActions } from './projectCardActions';
import { compactThumbnail } from '../model/planThumbnail';
import { mineEntry } from '../model/projectFilter';
import { accountItemEntry } from '../model/accountCostEntries';
import { accountItemPage } from '../cloud/libraryPages';
import { projectPage } from '../cloud/projectPages';
import { pagedListFake } from '@/hooks/usePagedList.testing';

const project = { id: 'one', name: '我的项目', updatedAt: '2026-10-08', revision: 0, cloud: true };
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
/** 列表接口已经返回的云端项目（第一页）；total 是符合筛选的总数，counts.mine 是云端项目总数。 */
const cloud = (rows: ProjectSummary[], total = rows.length) => { pagedListFake.remote = { list: rows.slice(0, 20).map(mineEntry), total, counts: { mine: total } }; };
beforeEach(() => { pagedListFake.reset(); cloud([project]); });
describe('管理端精简与加载分支', () => {
  it('骨架只有非文字占位和无障碍加载标签', () => {
    const html = render(createElement(ManagementLoading, { heading: true, label: '加载账号成本' }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('正在读取');
    expect(html).not.toContain('<button');
    expect(html).toContain('cms-loading-heading');
  });
  it('家具管理骨架按家具库版式排布，而不是套用项目卡片网格', () => {
    const html = render(createElement(ManagementLoading, { heading: true, label: '加载家具', variant: 'library' }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-loading-filter-rows');
    expect(html).toContain('cms-skeleton-search-inline');
    expect(html).toContain('cms-loading-chips');
    expect(html).toContain('cms-loading-item-visual');
    expect(html).not.toContain('cms-loading-grid');
    expect(html).not.toContain('<button');
  });
  it('项目管理骨架按项目页版式排布：来源胶囊 + 4:3 项目卡片', () => {
    const html = render(createElement(ManagementLoading, { heading: true, label: '加载项目', variant: 'projects' }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-skeleton-icon-action');
    expect(html).toContain('cms-loading-chips');
    expect(html).toContain('cms-loading-project-thumb');
    expect(html).not.toContain('cms-loading-item-visual');
    expect(html).not.toContain('<button');
  });
  const projects = () => ({ guests: [], builtins: TEMPLATE_PRESETS.map(p => ({ id: 'builtin-template:' + p.id, name: p.name, revision: 0, updatedAt: '', builtin: true, templateId: p.id })), loading: false, open: async () => true }) as unknown as ReturnType<typeof useProjects>;
  it('选了外部 DXF 后显示识别确认弹窗；没有待识别图纸时不显示', () => {
    expect(render(createElement(ProjectManager, { projects: projects(), opened: () => {} }))).not.toContain('data-dxf-import');
    importState.drawing = { source: {}, name: '户型图' };
    try {
      expect(render(createElement(ProjectManager, { projects: projects(), opened: () => {} }))).toContain('data-dxf-import="户型图"');
    } finally { importState.drawing = null; }
  });
  it('刷新在新建左侧，切换筛选时保留上一份项目，列表底部没有重复刷新', () => {
    pagedListFake.loading = true;
    const html = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden/);
    expect(html.indexOf('cms-refresh-button')).toBeGreaterThan(-1);
    expect(html.indexOf('cms-refresh-button')).toBeLessThan(html.indexOf('新建项目'));
    expect(html).toMatch(/<button[^>]*cms-refresh-button[^>]*aria-label="刷新"/);
    // 页头与家具库同结构：标题 + 说明（不再有小标题），操作在页头而不在筛选面板
    expect(html).toContain('项目管理');
    expect(html).not.toContain('cms-page-eyebrow');
    expect(html.indexOf('新建项目')).toBeLessThan(html.indexOf('cms-filter-rows'));
    expect(html).toContain('我的项目');
    expect(html).not.toContain('正在读取');
    expect(html).not.toContain('cms-loading-placeholder');
    expect(html).not.toContain('project-list-footer');
  });
  it('我的项目与内置模板同一套卡片：点卡片打开，「⋯」与标题同行', () => {
    const guest = { ...project, id: 'local', name: '本地项目', cloud: false, state: createProject('blank').state };
    const html = render(createElement(ProjectManager, { projects: { ...projects(), guests: [guest] } as unknown as ReturnType<typeof useProjects>, opened: () => {} }));
    for (const name of ['本地项目', '我的项目']) {
      expect(html).toContain(`aria-label="打开项目 ${name}"`);
      expect(html).toContain(`aria-label="${name} 的更多操作"`);
    }
    expect(html).toContain('aria-label="预览模板 三室两厅两卫 · 原木之家"');
    expect(html).toContain('aria-label="三室两厅两卫 · 原木之家 的更多操作"');
    // 卡片只显示标题：没有模板描述、面积和单独的预览/新建按钮
    for (const text of ['原木风格 · 双卫', '室内约', '只读预览', '用此模板新建']) expect(html).not.toContain(text);
    expect(html).not.toContain('builtin-template-card');
    // 本机项目实时渲染平面图；没有缩略图的旧云端项目显示占位
    expect(html).toContain('aria-label="本地项目 平面缩略图"');
    expect(html).toContain('project-card-placeholder');
  });
  it('云端项目用保存时留下的瘦身平面图渲染缩略图', () => {
    cloud([{ ...project, thumbnail: compactThumbnail(createProject('blank').state) }]);
    const html = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(html).toContain('aria-label="我的项目 平面缩略图"');
    expect(html).not.toContain('project-card-placeholder');
  });
  it('「⋯」菜单：我的项目可重命名、复制、删除（置底、危险色），系统默认方案只能复制', () => {
    const on = { rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn() };
    const normal = mineCardActions({ ...project }, on);
    expect(normal.map(a => a.label)).toEqual(['重命名', '复制', '删除']);
    expect(normal.every(a => !a.disabled)).toBe(true);
    expect(normal.map(a => !!a.danger)).toEqual([false, false, true]);
    const system = mineCardActions({ ...project, system: true }, on);
    expect(system.map(a => [a.label, !!a.disabled, a.hint])).toEqual([
      ['重命名', true, '系统默认方案不可重命名'], ['复制', false, undefined], ['删除', true, '系统默认方案不可删除'],
    ]);
    const copy = vi.fn();
    const template = templateCardActions(copy);
    expect(template.map(a => a.label)).toEqual(['复制为我的项目']);
    template[0].onSelect();
    expect(copy).toHaveBeenCalled();
  });
  it('首次无数据加载和真实空态明确区分', () => {
    cloud([]);
    pagedListFake.loading = true;
    const loading = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    pagedListFake.loading = false;
    const empty = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(loading).toContain('cms-loading-placeholder');
    expect(loading).not.toContain('还没有设计项目');
    expect(empty).toContain('还没有设计项目');
    expect(empty).not.toContain('cms-loading-placeholder');
    expect(empty).not.toContain('没有匹配的项目');
  });
  it('项目管理与家具库同版式：搜索框与全部 / 内置 / 我的三个分类，默认全部', () => {
    const html = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(html).toContain('aria-label="搜索项目"');
    expect(html).toContain('aria-label="项目分类"');
    // 项目管理没有左侧切换器：胶囊所在行是 bare 单列，从行首平铺，不被压进左侧固定列
    expect(html).toContain('class="cms-filter-group"');
    expect(html).not.toContain('cms-filter-group--bare');
    expect(html).not.toContain('cms-filter-group-label');
    // 搜索框与新建在页头同一行，筛选另起一行
    const head = html.slice(0, html.indexOf('cms-filter-rows'));
    expect(head).toContain('aria-label="搜索项目"');
    expect(head).toContain('新建项目');
    for (const label of ['全部', '内置', '我的']) expect(html).toMatch(new RegExp('>' + label + '<b>\\d+</b>'));
    expect(html).toMatch(/aria-pressed="true"[^>]*>全部<b>/);
    // 不再有「全部项目 N 项 / 按修改时间排序」结果标题行
    expect(html).not.toContain('cost-results-heading');
    expect(html).not.toContain('按修改时间排序');
    expect(html).toContain('aria-label="打开项目 我的项目"');
    // 我的项目按修改时间排在内置模板之前
    expect(html.indexOf('打开项目 我的项目')).toBeLessThan(html.indexOf('预览模板 '));
  });
  it('滚动加载：首批只渲染 20 条，云端还有更多时内置模板暂不露出，数量来自列表接口', () => {
    cloud(Array.from({ length: 45 }, (_, i) => ({ ...project, id: 'p' + i, name: '项目' + i })), 45);
    const first = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(first.match(/aria-label="打开项目 /g)).toHaveLength(20);
    // 首屏只有第 1 页的 20 条；滚到底部自动加载下一页，没有需要点击的「加载更多」按钮
    expect(first).toContain('正在加载更多');
    expect(first).not.toContain('>加载更多</button>');
    expect(first).not.toContain('预览模板 ');
    expect(first).toMatch(/>我的<b>45<\/b>/);
    expect(first).toMatch(new RegExp('>全部<b>' + (45 + TEMPLATE_PRESETS.length) + '</b>'));
    // 全部读完时不再显示加载状态
    cloud([project]);
    expect(render(createElement(ProjectManager, { projects: projects(), opened: () => {} }))).not.toContain('正在加载更多');
  });
  it('项目列表接口：按页读取我的云端项目，带上当前搜索词，列表行换成项目卡片', async () => {
    render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    vi.mocked(projectPage).mockResolvedValueOnce({ list: [project], pagination: { page: 2, pageSize: 20, total: 21 }, counts: { mine: 21 } });
    const page = await pagedListFake.options!.remote!({ page: 2, pageSize: 20 });
    expect(projectPage).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }, { query: '' });
    expect(page.list).toEqual([mineEntry(project)]);
    expect(page.counts).toEqual({ mine: 21 });
  });
  it('列表读取失败显示错误与重试，而不是“还没有设计项目”', () => {
    cloud([]);
    pagedListFake.error = 'Failed to fetch';
    const failed = render(createElement(ProjectManager, { projects: projects(), opened: () => {} }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('云端项目读取失败');
    expect(failed).toContain('重试');
    expect(failed).not.toContain('还没有设计项目');
  });
  const furniture = () => render(createElement(AccountFurnitureLibrary, { revision: 0, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} }));
  it('家具管理首次进入：页头可用、刷新转圈，列表位置是家具库版式的骨架', () => {
    pagedListFake.remote = { list: [], total: 0, counts: {} };
    pagedListFake.loading = true;
    const html = furniture();
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-loading-item-visual');
    expect(html).not.toContain('cms-item-card--cost');
    const toolbar = html.slice(html.indexOf('cms-heading-actions'));
    // 刷新与项目管理 / 小助手同一套：图标按钮在新建左侧，加载中转圈并禁用
    expect(toolbar).toMatch(/cms-refresh-button cms-icon-button" disabled="" aria-busy="true" aria-label="刷新"><svg[^>]*animate-spin/);
    expect(toolbar.indexOf('aria-label="刷新"')).toBeLessThan(toolbar.indexOf('新建家具'));
  });
  it('家具管理采用成本版式：硬装软装切换与价格卡片，我的条目在前、内置在后', () => {
    const wall = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    pagedListFake.remote = { list: [accountItemEntry({ kind: 'wall', item: wall })], total: 1, counts: { 墙面: 1, 硬装: 1, 软装: 0, 全部: 1, 自定义: 1 } };
    const html = furniture();
    expect(html).toContain('cms-item-card--cost');
    expect(html).not.toContain('cost-list-row');
    expect(html).not.toContain('cost-policy');
    expect(html).not.toContain('修改后自动保存');
    expect(html).toContain('class="cms-filter-group"');
    // 默认「全部」：第一级列出全部 / 硬装 / 软装，不出现细分胶囊
    expect(html).toContain('aria-label="硬装软装"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>全部<b>\d+<\/b>/);
    expect(html).toContain('>硬装<b>');
    expect(html).toContain('>软装<b>');
    // 「自定义」是一级分类，排在软装之后；数量只算账号里自建的条目
    expect(html).toContain('>自定义<b>1</b>');
    expect(html.indexOf('>软装<b>')).toBeLessThan(html.indexOf('>自定义<b>'));
    expect(html).not.toContain('aria-label="硬装分类"');
    expect(html).not.toContain('>卧室<b>');
    expect(html.match(/class="cms-filter-group/g)).toHaveLength(1);
    // 卡片连成一整片：没有「全部单价」标题行，也没有按分类分段的小标题；第一张是我的墙面
    expect(html).not.toContain('cost-results-heading');
    expect(html).not.toContain('全部单价');
    expect(html).not.toContain('cms-category-block');
    expect(html.match(/class="cms-item-grid"/g)).toHaveLength(1);
    expect(html.match(/aria-label="(编辑|查看)[^"]*"/)![0]).toBe('aria-label="编辑艺术涂料单价"');
    expect(html.match(/aria-label="(编辑|查看)[^"]*"/g)).toHaveLength(20);
    expect(html).toContain('正在加载更多');
    const toolbar = html.slice(html.indexOf('cms-heading-actions'), html.indexOf('cms-filter-rows'));
    expect(toolbar).toContain('搜索材料或家具');
    // 保存状态空闲时不渲染
    expect(html).not.toContain('cms-sync-pill');
    expect(html).not.toContain('正在读取');
  });
  it('家具读取失败仍显示内置条目并给出错误与重试', () => {
    pagedListFake.remote = { list: [], total: 0, counts: {} };
    pagedListFake.error = '读取失败';
    const html = furniture();
    expect(html).toContain('cms-item-card');
    expect(html).toContain('读取失败');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('正在读取家具');
  });
  it('家具管理的列表接口：大类、分类与搜索词交给数据库筛选，自建条目换成卡片、数量补上大类合计', async () => {
    furniture();
    vi.mocked(accountItemPage).mockResolvedValueOnce({ list: [{ kind: 'wall', item: { key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 } }], pagination: { page: 1, pageSize: 20, total: 1 }, counts: { 墙面: 1, 卧室: 2 } });
    const page = await pagedListFake.options!.remote!({ page: 1, pageSize: 20 });
    expect(accountItemPage).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 }, { major: undefined, category: undefined, query: '' });
    expect((page.list[0] as { name: string; account?: unknown }).name).toBe('艺术涂料');
    expect(page.counts).toEqual({ 墙面: 1, 卧室: 2, 全部: 3, 硬装: 1, 软装: 2, 自定义: 3 });
  });
  it('统一搜索框：空闲提示 / 快捷键，输入后显示匹配数与清空，加载时转圈', () => {
    const idle = render(createElement(CmsSearchField, { label: '搜索', placeholder: '搜索…', value: '', onChange: () => {}, matchCount: 6 }));
    expect(idle).toContain('cms-search-kbd');
    expect(idle).not.toContain('匹配');
    expect(idle).not.toContain('清空搜索');
    const typed = render(createElement(CmsSearchField, { label: '搜索', placeholder: '搜索…', value: '沙发', onChange: () => {}, matchCount: 6 }));
    expect(typed).toContain('匹配 6 项');
    expect(typed).toContain('aria-label="清空搜索"');
    expect(typed).not.toContain('cms-search-kbd');
    const loading = render(createElement(CmsSearchField, { label: '搜索', placeholder: '搜索…', value: '', onChange: () => {}, loading: true, loadingLabel: '加载家具' }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-label="加载家具"');
  });
});
