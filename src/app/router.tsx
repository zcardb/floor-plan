import Index from "./pages/studio-page";
import NotFound from "./pages/not-found-page";
import {
  ASSISTANTS_PATH,
  FURNITURE_PATH,
  PROJECTS_PATH,
  PROJECT_ROUTE,
  STYLES_PATH,
  STYLE_ROUTE,
  TEMPLATE_ROUTE,
} from "./routes";

/**
 * 页面级路由。所有工作室页面共用同一个 <Index /> 实例（会话、自动保存、当前项目都挂在它上面），
 * 所以它们是同一条父路由下的子路径，子路径只负责匹配地址，页面由 Index 按地址渲染。
 * 新增页面：在 app/routes.ts 加路径，再到这里注册。
 */
export const routers = [
  {
    path: "/",
    name: "home",
    element: <Index />,
    children: [
      { path: PROJECTS_PATH, name: "projects" },
      { path: PROJECT_ROUTE, name: "project-detail" },
      { path: TEMPLATE_ROUTE, name: "template-preview" },
      { path: FURNITURE_PATH, name: "furniture" },
      { path: ASSISTANTS_PATH, name: "assistants" },
      { path: STYLES_PATH, name: "styles" },
      { path: STYLE_ROUTE, name: "style-detail" },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
