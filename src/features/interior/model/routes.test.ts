import { describe, expect, it } from 'vitest';
import { cmsPath, projectPath, projectPathFor, resolveView, templatePath, templateProjectId, PROJECTS_PATH } from './routes';
import { builtinProject, BUILTIN_PREFIX } from '../data/templatePresets';
import { presetById } from '../data/templates';
import type { Project } from './types';

const view = (pathname: string, loggedIn: boolean) => resolveView({ pathname, loggedIn });
const project = (extra: Partial<Project>) => ({ id: 'p1', name: '方案', revision: 0, updatedAt: '', ...extra }) as Project;

describe('页面级路由解析', () => {
  it.each([
    ['/projects', 'projects'],
    ['/furniture', 'furniture'],
    ['/assistants', 'assistants'],
    ['/styles', 'styles'],
    ['/furniture/', 'furniture'],
  ])('已登录访问 %s 显示管理页 %s', (pathname, tab) => {
    expect(view(pathname, true)).toEqual({ kind: 'cms', tab });
  });

  it('已登录访问项目详情，按地址里的 id 打开', () => {
    expect(view('/projects/abc-123', true)).toEqual({ kind: 'project', projectId: 'abc-123' });
  });

  it('已登录访问内置模板，映射成内置项目 id', () => {
    expect(view('/templates/reference', true)).toEqual({ kind: 'project', projectId: BUILTIN_PREFIX + 'reference' });
  });

  it('已登录访问首页或不存在的模板，替换到项目管理', () => {
    expect(view('/', true)).toEqual({ kind: 'redirect', to: PROJECTS_PATH });
    expect(view('/templates/not-a-template', true)).toEqual({ kind: 'redirect', to: PROJECTS_PATH });
  });

  it('未登录只有首页可用', () => {
    expect(view('/', false)).toEqual({ kind: 'guest' });
  });

  it.each(['/projects', '/projects/abc-123', '/templates/reference', '/furniture', '/assistants', '/styles'])('未登录访问 %s 回到首页', pathname => {
    expect(view(pathname, false)).toEqual({ kind: 'redirect', to: '/' });
  });
});

describe('路径生成', () => {
  it('侧边栏模块对应固定路径，未知模块回到项目管理', () => {
    expect(cmsPath('projects')).toBe('/projects');
    expect(cmsPath('furniture')).toBe('/furniture');
    expect(cmsPath('assistants')).toBe('/assistants');
    expect(cmsPath('styles')).toBe('/styles');
    expect(cmsPath('unknown')).toBe('/projects');
  });

  it('云端与本机项目落在项目详情页', () => {
    expect(projectPathFor(project({ id: 'cloud-1', cloud: true }))).toBe(projectPath('cloud-1'));
    expect(projectPathFor(project({ id: 'local-1', cloud: false }))).toBe('/projects/local-1');
  });

  it('内置模板落在模板预览页，并能解析回同一个项目', () => {
    const builtin = builtinProject(presetById('reference')!);
    const path = projectPathFor(builtin);
    expect(path).toBe(templatePath('reference'));
    expect(view(path!, true)).toEqual({ kind: 'project', projectId: builtin.id });
    expect(templateProjectId('reference')).toBe(builtin.id);
  });

  it('无法识别的内置项目没有地址', () => {
    expect(projectPathFor(project({ id: BUILTIN_PREFIX + 'missing' }))).toBeNull();
  });
});
