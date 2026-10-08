import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkbenchHeader } from './WorkbenchHeader';
import { ManagementLoading } from './ManagementLoading';
import { ProjectManager } from './ProjectManager';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { AccountCostManager } from './AccountCostManager';
import type { useProjects } from '../cloud/useProjects';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';

const project = { id: 'one', name: '我的项目', updatedAt: '2026-10-08', revision: 0, cloud: true };
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
describe('管理端精简与加载分支', () => {
  it('详情顶栏四个入口按左导航右操作排列，无品牌与账号文字', () => {
    const html = render(createElement(WorkbenchHeader, { project, projectList: [project], hasMore: false, listLoading: false, view: '2d', onBack: () => {}, onOpen: async () => true, onLoadMore: () => {}, onLogout: () => {}, onDownload: () => {} }));
    expect(html).not.toContain('STUDIO');
    expect(html).not.toContain('save-indicator');
    expect(html).toContain('aria-label="我的账号"');
    expect(html).not.toContain('<span>我的账号</span>');
    const positions = ['aria-label="返回项目管理"', 'aria-label="切换项目：我的项目"', 'aria-label="我的账号"', 'aria-label="下载设计图"'].map(text => html.indexOf(text));
    expect(positions.every(pos => pos >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b) => a-b));
  });
  it('骨架只有非文字占位和无障碍加载标签', () => {
    const html = render(createElement(ManagementLoading, { heading: true, label: '加载账号成本' }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('正在读取');
    expect(html).not.toContain('<button');
    expect(html).toContain('cms-loading-heading');
  });
  const projects = (loading: boolean, cloud = [project]) => ({ guests: [], cloud, loading, hasMore: false, reload: () => {}, open: async () => true }) as unknown as ReturnType<typeof useProjects>;
  it('刷新在新建左侧，后台刷新保留项目，列表底部没有重复刷新', () => {
    const html = render(createElement(ProjectManager, { projects: projects(true), opened: () => {} }));
    expect(html.indexOf('aria-label="刷新项目"')).toBeLessThan(html.indexOf('新建项目'));
    expect(html).toContain('我的项目');
    expect(html).not.toContain('正在读取');
    expect(html).not.toContain('cms-loading-placeholder');
    expect(html).not.toContain('project-list-footer');
  });
  it('首次无数据加载和真实空态明确区分', () => {
    const loading = render(createElement(ProjectManager, { projects: projects(true, []), opened: () => {} }));
    const empty = render(createElement(ProjectManager, { projects: projects(false, []), opened: () => {} }));
    expect(loading).toContain('cms-loading-placeholder');
    expect(loading).not.toContain('还没有设计项目');
    expect(empty).toContain('还没有设计项目');
    expect(empty).not.toContain('cms-loading-placeholder');
  });
  it('成本页账号家具读取使用搜索框原位反馈并保留价格列表', () => {
    const html = render(createElement(AccountCostManager, { settings: {}, save: async () => true, saving: false, error: '', items: [], onDirty: () => {}, onNew: () => {}, hasMore: false, loading: true, catalogError: '', loadMore: () => {} }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cost-list-row');
    expect(html).not.toContain('正在读取');
  });
  it('家具读取仍显示内置家具并保留错误，但不增加读取文字行', () => {
    const catalog = { items: [], count: 0, counts: {}, loading: true, error: '读取失败', hasMore: false } as unknown as ReturnType<typeof useFurnitureCatalog>;
    const html = render(createElement(AccountFurnitureLibrary, { catalog, defaults: {}, onNew: () => {} }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-item-card');
    expect(html).toContain('读取失败');
    expect(html).not.toContain('正在读取家具');
  });
});
