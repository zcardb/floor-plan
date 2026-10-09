# 页面级路由与 URL 双向同步

## Context

现在整个应用只有一个路由 `/`，所有“页面切换”都是内存状态：

- `src/pages/Index.tsx` 用 `editingOwner` 决定显示管理后台还是工作台（项目详情）。
- `src/features/interior/components/AccountCMS.tsx` 用 `tab` 状态切换侧边栏（项目管理 / 家具管理 / 小助手）。
- 当前打开的项目只存在 `useProjects().active` 里。

结果是：刷新会回到默认页，浏览器前进 / 后退无效，链接无法分享或收藏。本次把**页面级**导航全部搬到 URL，并且双向同步（界面操作改 URL；URL 变化、刷新、粘贴链接、前进后退也驱动界面）。页面内状态（列表筛选、2D/3D、属性/成本面板）按你的选择不进 URL。

同时把“新页面必须带路由”写进项目规范，作为以后所有改动的硬约定。

## URL 方案

| URL | 页面 | 未登录访问 |
|---|---|---|
| `/` | 游客工作台（本机草稿） | 正常显示；已登录则替换跳到 `/projects` |
| `/projects` | 项目管理 | 替换跳到 `/` |
| `/furniture` | 家具管理 | 替换跳到 `/` |
| `/assistants` | 小助手 | 替换跳到 `/` |
| `/projects/:projectId` | 项目详情（工作台，云端 / 本机项目） | 替换跳到 `/` |
| `/templates/:templateId` | 内置模板只读预览（工作台） | 替换跳到 `/` |

说明：游客只有一份本机草稿，切换模板是“替换草稿”而不是换页面，所以游客始终停在 `/`。

## 设计要点

1. **URL 是“当前在哪个页面”的唯一来源**。删除 `Index.tsx` 的 `editingOwner` 和 `AccountCMS` 内部的 `tab` 状态，改为从路由推导。
2. **共享同一个 `Index` 实例**：`useProjects` 持有会话、自动保存定时器和当前项目，不能因换路由被卸载。所以在 `src/router.tsx` 里用一个父路由 `element: <Index />` 挂上面这些子路径（子路由只提供路径匹配，不单独渲染）。
3. **界面 → URL**：打开 / 新建 / 复制 / 导入 / 游客转存云端成功后，用 `navigate(projectPath(当前项目))`；侧边栏点击 `navigate('/furniture')` 等；工作台“返回项目管理”和删除当前项目后 `navigate('/projects')`。
4. **URL → 界面**：一个 effect 监听路由里的项目 id，与当前 `active` 不一致时调用新增的 `projects.openById(id)`；加载期间显示现有的 `ManagementLoading`（文案“打开项目”），不会先闪出别的项目。打开失败（不存在 / 无权限，`open` 已有失败提示）则替换跳到 `/projects`。
5. **离开守卫（含浏览器后退）**：用 React Router 的 `useBlocker`，全应用只注册一个：
   - 在家具管理有未保存的账号单价时：弹出现有的“账号单价尚未保存”确认框，确认才放行。侧边栏点击与浏览器后退走同一条路径。
   - 从项目详情离开时：先 `await projects.save()`，成功放行，失败则留在原页（与现在“返回项目管理”行为一致）。
6. **AccountCMS 保持与路由解耦**（现有测试是直接把它当函数调用的）：改为受控属性 `tab` / `onTab` / `onDirty` / `pendingLeave`，路由逻辑全部放在页面层。

## 关键文件

- `src/router.tsx` — 父路由 + 子路径，每条带语义化 `name`。
- `src/features/interior/model/routes.ts`（新增）— 路径常量、`cmsPath(tab)`、`projectPath(project)`、纯函数 `resolveView({ pathname 参数, 是否登录 })` 返回 `cms / project / guest / redirect`。
- `src/features/interior/model/routes.test.ts`（新增）— 上述纯函数的单测。
- `src/features/interior/components/useStudioRoute.ts`（新增）— 封装 `useParams / useNavigate / useBlocker`、URL→项目 的同步 effect 与离开守卫，`Index.tsx` 只消费结果。
- `src/pages/Index.tsx` — 去掉 `editingOwner`，改用 `useStudioRoute`；`opened` / `manage` / `removeProject` / `duplicateProject` / 游客转存 改为导航。
- `src/features/interior/cloud/useProjects.ts` — 新增 `openById(id)`（复用现有 `open`：内置 id → 模板；本机列表命中 → 本机；否则按云端读取）和读取当前项目 id 的 `activeId()`。
- `src/features/interior/components/AccountCMS.tsx` — `tab` 受控化，离开确认框同时服务“退出登录”和被拦截的路由跳转。
- `src/features/interior/components/newFurnitureCategory.test.tsx` — 适配 `AccountCMS` 新属性。
- `CodeGuideline.md` — 新增“路由约定”一节并登记新模块（见下）。

`Workbench.tsx`、`ProjectManager.tsx` 不需要改：它们已经通过 `projects()` / `opened()` / `projectNavigation` 回调把导航交给上层。

## “记住”的方式

我没有跨会话的记忆，能长期生效的做法是写进项目规范文件。会在 `CodeGuideline.md` 增加“路由约定”：

- 任何新页面、或任何页面级视图切换（侧边栏项、详情页、独立流程页），**必须**在 `src/router.tsx` 注册路由，路径集中定义在 `routes.ts`。
- 禁止用 `useState` 表达“当前在哪个页面”；URL 是唯一来源，且必须双向（刷新、前进后退、粘贴链接都能还原）。
- 新路由要说明未登录时的去向，并补 `resolveView` 的测试用例。

## Implementation checklist

- [ ] `routes.ts`：导出路径常量、`CMS_TABS`、`cmsPath`、`projectPath`（内置 → `/templates/:id`，其它 → `/projects/:id`）、`resolveView`
- [ ] `router.tsx`：`/` 父路由挂 `index`、`projects`、`projects/:projectId`、`templates/:templateId`、`furniture`、`assistants`，保留 `*` 404 与 `window.__routers__`
- [ ] `useProjects.ts`：新增 `openById` 与 `activeId`，不改动现有 `open/create/remove` 行为
- [ ] `useStudioRoute.ts`：未登录访问受保护路径 → 替换跳 `/`；已登录访问 `/` → 替换跳 `/projects`
- [ ] `useStudioRoute.ts`：路由项目 id 与 `active` 不一致时调用 `openById`，失败替换跳 `/projects`，并防止过期请求覆盖较新的跳转
- [ ] `useStudioRoute.ts`：单一 `useBlocker` 处理“家具管理未保存”与“离开项目先保存”两种情况
- [ ] `Index.tsx`：删除 `editingOwner`，按 `resolveView` 结果渲染 CMS / 工作台 / 加载态
- [ ] `Index.tsx`：打开、新建、复制、模板复制、导入、游客转存云端成功后导航到对应项目路径
- [ ] `Index.tsx`：“返回项目管理”与删除当前项目后导航到 `/projects`
- [ ] `AccountCMS.tsx`：`tab` / `onTab` / `onDirty` / `pendingLeave` 受控化，侧边栏高亮取自路由
- [ ] 更新 `newFurnitureCategory.test.tsx` 中 3 处 `AccountCMS(...)` 调用
- [ ] `CodeGuideline.md`：新增“路由约定”，登记 `routes.ts` 与 `useStudioRoute.ts`

## Verification checklist

- [ ] 正向：登录后点侧边栏三项，地址栏依次为 `/projects`、`/furniture`、`/assistants`，高亮一致
- [ ] 正向：点项目卡片进入后地址为 `/projects/<id>`；刷新仍停在该项目
- [ ] 正向：浏览器后退回到 `/projects`，前进再次进入同一项目
- [ ] 正向：新建 / 复制项目后地址变为新项目 id；预览内置模板地址为 `/templates/<id>`
- [ ] 正向：新标签页直接粘贴 `/furniture` 与 `/projects/<id>` 能直达
- [ ] 默认 / 反向：未登录打开 `/projects`、`/projects/<id>` 会落到 `/`；登录后打开 `/` 会落到 `/projects`
- [ ] 反向：`/projects/不存在的id` 出现“项目加载失败”提示并落到 `/projects`，不显示错误项目
- [ ] 边界：家具管理有未保存单价时按浏览器后退，弹出确认框；“继续编辑”留在原页且草稿保留，“放弃更改并离开”才跳转
- [ ] 边界：工作台内切换项目、删除当前项目、退出登录后，地址与界面保持一致，无循环跳转
- [ ] 边界：未知路径仍显示 404 页
- [ ] `routes.test.ts` 覆盖每条路径在登录 / 未登录下的 `resolveView` 结果与 `projectPath` 三种项目类型
- [ ] `pnpm run lint`、`pnpm test`、`pnpm run build` 全部通过
