import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../cloud/useFurnitureImage',()=>({useFurnitureImage:()=>({image:'',busy:false,error:'',generate:vi.fn(),cancel:vi.fn()})}));
import { ManagementLoading } from './ManagementLoading';
import { ProjectManager } from './ProjectManager';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import type { useProjects } from '../cloud/useProjects';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';

const project = { id: 'one', name: '我的项目', updatedAt: '2026-10-08', revision: 0, cloud: true };
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
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
    expect(html).toContain('cms-loading-panel');
    expect(html).toContain('cms-loading-chips');
    expect(html).toContain('cms-loading-item-visual');
    expect(html).not.toContain('cms-loading-grid');
    expect(html).not.toContain('<button');
  });
  const projects = (loading: boolean, cloud = [project]) => ({ guests: [], cloud, loading, hasMore: false, reload: () => {}, open: async () => true }) as unknown as ReturnType<typeof useProjects>;
  it('刷新在新建左侧，后台刷新保留项目，列表底部没有重复刷新', () => {
    const html = render(createElement(ProjectManager, { projects: projects(true), opened: () => {} }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden/);
    expect(html.indexOf('cms-refresh-button')).toBeGreaterThan(-1);
    expect(html.indexOf('cms-refresh-button')).toBeLessThan(html.indexOf('新建项目'));
    expect(html).toContain('我的项目');
    expect(html).not.toContain('正在读取');
    expect(html).not.toContain('cms-loading-placeholder');
    expect(html).not.toContain('project-list-footer');
  });
  it('本地项目仅保留打开、重命名和删除，云端项目保留普通复制', () => {
    const guest = { ...project, id: 'local', name: '本地项目', cloud: false };
    const localProjects = { ...projects(false, []), guests: [guest] } as unknown as ReturnType<typeof useProjects>;
    const local = render(createElement(ProjectManager, { projects: localProjects, opened: () => {} }));
    const cloud = render(createElement(ProjectManager, { projects: projects(false), opened: () => {} }));
    const mixed = render(createElement(ProjectManager, { projects: { ...localProjects, cloud: [project] }, opened: () => {} }));
    for (const html of [local, cloud, mixed]) expect(html).not.toContain('复制到云端');
    for (const html of [local, mixed]) {
      expect(html).toContain('aria-label="打开项目 本地项目"');
      expect(html).toContain('aria-label="重命名本地项目"');
      expect(html).toContain('aria-label="删除本地项目"');
      expect(html).not.toContain('aria-label="复制本地项目"');
    }
    for (const html of [cloud, mixed]) {
      expect(html).toContain('aria-label="打开项目 我的项目"');
      expect(html).toContain('aria-label="重命名我的项目"');
      expect(html).toContain('aria-label="复制我的项目"');
      expect(html).toContain('aria-label="删除我的项目"');
    }
  });
  it('删除图标常驻危险色，重命名与复制保持中性', () => {
    const guest = { ...project, id: 'local', name: '本地项目', cloud: false };
    const html = render(createElement(ProjectManager, { projects: { ...projects(false), guests: [guest] } as unknown as ReturnType<typeof useProjects>, opened: () => {} }));
    const tag = (label: string) => {
      const at = html.indexOf(`aria-label="${label}"`);
      return html.slice(html.lastIndexOf('<button', at), html.indexOf('>', at) + 1);
    };
    for (const label of ['删除本地项目', '删除我的项目']) expect(tag(label)).toContain('text-destructive');
    for (const label of ['重命名本地项目', '重命名我的项目', '复制我的项目']) expect(tag(label)).not.toContain('text-destructive');
  });
  it('首次无数据加载和真实空态明确区分', () => {
    const loading = render(createElement(ProjectManager, { projects: projects(true, []), opened: () => {} }));
    const empty = render(createElement(ProjectManager, { projects: projects(false, []), opened: () => {} }));
    expect(loading).toContain('cms-loading-placeholder');
    expect(loading).not.toContain('还没有设计项目');
    expect(empty).toContain('还没有设计项目');
    expect(empty).not.toContain('cms-loading-placeholder');
  });
  it('列表读取失败显示错误与重试，而不是“还没有设计项目”', () => {
    const failed = render(createElement(ProjectManager, { projects: { ...projects(false, []), listError: 'Failed to fetch' } as ReturnType<typeof useProjects>, opened: () => {} }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('云端项目读取失败');
    expect(failed).toContain('重试');
    expect(failed).not.toContain('还没有设计项目');
  });
  it('家具管理采用成本版式：搜索框原位反馈、硬装软装两行与价格卡片', () => {
    const catalog = { items: [], count: 0, counts: {}, loading: true, error: '', hasMore: false } as unknown as ReturnType<typeof useFurnitureCatalog>;
    const html = render(createElement(AccountFurnitureLibrary, { catalog, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-item-card--cost');
    expect(html).not.toContain('cost-list-row');
    expect(html).not.toContain('cost-policy');
    expect(html).not.toContain('修改后自动保存');
    expect(html).toContain('aria-label="硬装分类"');
    expect(html).toContain('aria-label="软装分类"');
    for (const name of ['地面', '墙面', '门窗', '卧室', '客厅', '餐厨', '卫浴', '家电', '书房']) expect(html).toContain('>' + name + '<b>');
    expect(html).not.toMatch(/<button[^>]*>.{0,400}?<span>硬装<\/span>/);
    const hard = html.slice(html.indexOf('cost-group--hard'), html.indexOf('cost-group--soft'));
    const soft = html.slice(html.indexOf('cost-group--soft'), html.indexOf('cost-results-heading'));
    expect(hard).toContain('aria-label="硬装分类"');
    expect(hard).not.toContain('aria-label="软装分类"');
    expect(soft).toContain('aria-label="软装分类"');
    expect(soft).not.toContain('aria-label="硬装分类"');
    for (const group of [hard, soft]) {
      const title = group.slice(group.indexOf('cost-group-label'), group.indexOf('cms-filter-bar'));
      expect(title).not.toContain('<button');
      expect(title).not.toContain('tabindex');
      expect(title).not.toContain('aria-pressed');
    }
    expect(html).toContain('全部单价');
    const toolbar = html.slice(html.indexOf('cost-toolbar'), html.indexOf('cost-group-columns'));
    expect(toolbar).toContain('搜索材料或家具');
    expect(toolbar).toContain('新建家具');
    expect(html.slice(0, html.indexOf('cost-controls'))).not.toContain('新建家具');
    expect(html).not.toContain('正在读取');
  });
  it('家具读取仍显示内置家具并保留错误，但不增加读取文字行', () => {
    const catalog = { items: [], count: 0, counts: {}, loading: true, error: '读取失败', hasMore: false } as unknown as ReturnType<typeof useFurnitureCatalog>;
    const html = render(createElement(AccountFurnitureLibrary, { catalog, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('cms-item-card');
    expect(html).toContain('读取失败');
    expect(html).not.toContain('正在读取家具');
  });
});
