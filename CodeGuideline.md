# 代码规范（Code Guideline）

本文件说明目录职责、新增代码放在哪里、路由与多语言规则。分层与依赖的完整规则见 `docs/architecture.md`，组件复用见 `AGENTS.md`；**新增、删除或挪动模块时，同一次改动里更新这些文档。**

## 目录总览

```
project-root/
├── index.html                 入口 HTML（引用 /src/main.tsx）
├── i18n.config.json           多语言清单：回退语言、语言名、浏览器识别别名、书写方向
├── public/                    静态资源；public/locales/{code}.json 为翻译文件
├── src/
│   ├── main.tsx               应用入口（平台约定，位置固定）
│   ├── analytics.ts           平台埋点（平台约定，位置固定）
│   ├── app/                   应用层：app.tsx（全局 Provider）、router.tsx（路由表）、routes.ts（路径与 resolveView）、pages/、account-cms/、hooks/
│   ├── features/<名>/         业务用例（清单见 src/features/features.md）
│   ├── components/<组件>/     跨 Feature 复用的界面；ui/ 为 shadcn 基础控件（清单见 src/components/components.md）
│   ├── contexts/<能力>/       由应用层提供 Provider 的全局能力
│   ├── lib/<能力>/            技术模块：floor-plan（户型领域内核）、drawing（图纸导出）、backend（Supabase 入口）、notify、paging、platform
│   ├── hooks/                 通用 Hook
│   ├── utils/                 通用纯函数
│   ├── styles/index.css       全局样式与主题 Token
│   ├── i18n/                  多语言运行时（平台脚手架）
│   └── integrations/supabase/ Supabase 客户端与类型（自动生成，不手改）
├── scripts/                   架构与测试目录检查
├── docs/                      架构、接口方案、UI 规范、跨模块功能规范
└── supabase/                  数据库迁移与 Edge Functions
```

## 新增代码放在哪里

| 要加的东西 | 放在 |
| --- | --- |
| 新页面 / 页面级视图 | `src/app/routes.ts` 加路径，`src/app/router.tsx` 注册（见下方路由规则）；页面装配放 `src/app/pages/` |
| 新的业务用例 | 新建 `src/features/<名>/`（含 `README.md`、`plan.md`、`index.ts`），并补进 `src/features/features.md` |
| 已有用例里的界面、Hook、接口、逻辑 | 该 Feature 的 `components/`、`hooks/`、`api/`、`model/` |
| 多个 Feature 共用的户型规则或数据 | `src/lib/floor-plan/` |
| 多个 Feature 共用的界面 | `src/components/<组件>/`，并补进 `src/components/components.md` |
| 与业务无关的 Hook / 纯函数 | `src/hooks/` / `src/utils/` |
| 列表数据 | 统一分页接口 + `usePagedList` + `ListLoadMore`（`docs/architecture.md` §5） |
| 后端读写 | 所属 Feature 的 `api/`，经 `@/lib/backend` |

命名：目录与文件 kebab-case，组件 PascalCase，Hook 以 `use` 开头；测试放所属模块的 `__tests__/`。

## 路由规则（强制）

每个页面级视图都必须体现在地址上，而且是双向的。

- **新页面或页面级视图切换（侧栏项、详情页、独立流程页）都要有自己的路由**：路径加在 `src/app/routes.ts`，在 `src/app/router.tsx` 注册并起语义化的 `name`。
- **不要用 `useState` 决定「当前是哪个页面」**：地址是唯一来源，页面由地址推导（`resolveView`），换页用 `navigate`。
- **双向**：界面操作更新地址；刷新、粘贴链接、浏览器前进后退都恢复同一页面（详情页恢复同一项目）。
- **工作室的各页面共用一个 `StudioPage` 实例**（`/` 下的子路由），会话、自动保存与当前项目在换地址时不会卸载；不要给它们拆出独立页面组件。
- **离开拦截只走 `src/app/hooks/use-studio-route.ts` 里唯一的 `useBlocker`**，浏览器后退与站内链接行为一致。
- **每条新路由都要写清未登录访客去哪**，并在 `src/app/__tests__/routes.test.ts` 补 `resolveView` 用例。
- 页面内的界面状态（列表筛选、2D / 3D、面板页签）不进地址，除非明确要求。

## 多语言（平台脚手架）

- 语言元数据只写在 `i18n.config.json`；不要在 `src/i18n/*.ts` 里硬编码语言列表、语言名、浏览器别名或 RTL 列表。
- 翻译内容在 `public/locales/{code}.json`（扁平的点分键），回退语言的文件是键的权威集合。
- 运行时只经 `src/i18n/util.ts` 读取清单；`src/i18n/config.ts` 是启动入口（初始化 i18next、同步 `<html lang/dir>`）。
- 组件直接用 `react-i18next` 的 `useTranslation()`，不另包 Hook。

## 功能规范（强制）

只属于一个模块的规则写在该模块的 `README.md`，跨模块的在 `docs/features/`（索引 `docs/features/README.md`）。改功能前先读对应规范，规则变化时同一次改动里更新。

- **所有家具、结构、标注的导出都要符合 CAD / DXF 行业规范**，见 `src/lib/drawing/README.md`：每类对象一个登记图层（ACI 颜色、线宽、线型），符号用命名 BLOCK + INSERT（块内无文字、无负缩放），文字从下方或右侧可读，毫米单位，`STUDIO_CN` 文字样式。
- 楼梯：`docs/features/stairs.md`；3D 场景、装修风格、方案报告：各自 Feature 的 `README.md`。

## 编码习惯

- 一个文件只做一件事；相关逻辑放在一起，避免不必要的模块依赖。
- 组件保持小而专注，过大时拆出子组件或 Hook。
- 复杂逻辑写注释；模块用途不明显时在文件顶部说明。
- 改完按 `AGENTS.md` §4 跑完检查。
