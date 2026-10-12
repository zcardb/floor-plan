import { matchPath } from "react-router-dom";
import { BUILTIN_PREFIX, isPresetId } from "../data/templatePresets";
import type { Project } from "./types";

/**
 * 页面级路由的唯一来源：路径常量、路径生成函数，以及把「URL + 是否登录」解析成
 * 当前页面的纯函数。视图内部的临时状态（列表筛选、2D/3D、面板模式）不进 URL。
 *
 * 约定：任何新增的页面级视图都必须在这里加常量，并在 src/router.tsx 注册。
 */
export const PROJECTS_PATH = "/projects";
export const FURNITURE_PATH = "/furniture";
export const ASSISTANTS_PATH = "/assistants";
export const STYLES_PATH = "/styles";
export const STYLE_ROUTE = "/styles/:styleId";
export const TEMPLATE_ROUTE = "/templates/:templateId";
export const PROJECT_ROUTE = "/projects/:projectId";

const CMS_PATHS = {
  projects: PROJECTS_PATH,
  furniture: FURNITURE_PATH,
  assistants: ASSISTANTS_PATH,
  styles: STYLES_PATH,
} as const;

export type CmsTab = keyof typeof CMS_PATHS;

export const CMS_TABS = Object.keys(CMS_PATHS) as CmsTab[];

export const cmsPath = (tab: string): string => CMS_PATHS[tab as CmsTab] ?? PROJECTS_PATH;

export const projectPath = (projectId: string) => PROJECTS_PATH + "/" + projectId;

/** 风格详情页地址；内置与自定义风格共用。 */
export const stylePath = (styleId: string) => STYLES_PATH + "/" + encodeURIComponent(styleId);

export const templatePath = (templateId: string) => "/templates/" + templateId;

/** 内置模板在 useProjects 里的项目 id，与 builtinProject() 保持一致。 */
export const templateProjectId = (templateId: string) => BUILTIN_PREFIX + templateId;

/** 打开某个项目后应该落在的地址：内置模板是只读预览页，其它项目是详情页。 */
export function projectPathFor(project: Project): string | null {
  if (project.builtin) return project.templateId && isPresetId(project.templateId) ? templatePath(project.templateId) : null;
  if (project.id.startsWith(BUILTIN_PREFIX)) {
    const templateId = project.id.slice(BUILTIN_PREFIX.length);
    return isPresetId(templateId) ? templatePath(templateId) : null;
  }
  return projectPath(project.id);
}

export type StudioView =
  | { kind: "guest" }
  | { kind: "cms"; tab: CmsTab; styleId?: string }
  | { kind: "project"; projectId: string }
  | { kind: "redirect"; to: string };

/**
 * 未登录时只有 `/` 可用（游客只有一份本机草稿），其余页面一律替换回 `/`。
 * 已登录时 `/` 不表示任何页面，替换到项目管理；不存在的模板同样回到项目管理。
 */
export function resolveView({ pathname, loggedIn }: { pathname: string; loggedIn: boolean }): StudioView {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (!loggedIn) return path === "/" ? { kind: "guest" } : { kind: "redirect", to: "/" };
  const templateId = matchPath(TEMPLATE_ROUTE, path)?.params.templateId;
  if (templateId && isPresetId(templateId)) return { kind: "project", projectId: templateProjectId(templateId) };
  const projectId = matchPath(PROJECT_ROUTE, path)?.params.projectId;
  if (projectId) return { kind: "project", projectId };
  const styleId = matchPath(STYLE_ROUTE, path)?.params.styleId;
  if (styleId) return { kind: "cms", tab: "styles", styleId };
  const tab = CMS_TABS.find((id) => CMS_PATHS[id] === path);
  if (tab) return { kind: "cms", tab };
  return { kind: "redirect", to: PROJECTS_PATH };
}
