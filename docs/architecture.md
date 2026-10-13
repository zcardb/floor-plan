# 架构与目录规范

本仓库按 FSD（Feature-Sliced）思路分层：**应用层装配页面，Feature 承载业务用例，共享层只放与业务用例无关的能力**。规则由 `pnpm check:architecture` 与 `pnpm check:test-layout` 自动检查，改结构前先读这份文档。

## 1. 目录总览

```
src/
├── main.tsx · analytics.ts · env.d.ts   平台约定入口（位置固定，见 §6）
├── app/                                  应用层：入口装配、路由、页面
│   ├── app.tsx · router.tsx · routes.ts  全局 Provider、路由表、页面路径与 resolveView
│   ├── pages/                            studio-page（工作室：编辑器 / 管理端共用一个实例）、not-found-page
│   ├── account-cms/                      管理端外壳（侧栏 + 四个管理页的装配）
│   └── hooks/use-studio-route.ts         地址 ⇄ 工作室状态的双向同步与离开拦截
├── features/<名>/                        业务用例（见 §3、src/features/features.md）
├── components/<组件>/                    跨 Feature 复用的界面（见 src/components/components.md）
│   └── ui/                               shadcn 基础控件（平台脚手架，不按本规范改名）
├── contexts/account-costs/               全局 Provider 能力：账号默认价（读写 + Context）
├── lib/<能力>/                           无全局 Provider 的技术模块
│   ├── floor-plan/                       户型领域内核：方案数据结构、几何、墙 / 房间 / 门窗 / 家具规则、成本、素材目录、内置模板与风格
│   ├── drawing/                          图纸生成与 SVG / DXF / PDF 写出（编辑器导出与方案报告共用）
│   ├── backend/                          Supabase 唯一入口：按需连接、列表接口（readPage）、类型
│   ├── notify/ · paging/ · platform/     提示消息与网站更新提示、统一分页契约、浏览器平台能力
│   └── utils.ts                          shadcn 的 cn()（平台脚手架）
├── hooks/                                通用 Hook（use-paged-list、use-async-action、use-debounced-value…）
├── utils/                                通用纯函数（after-first-screen）
├── styles/index.css                      全局样式与主题 Token
├── i18n/ · integrations/supabase/        平台脚手架与自动生成代码（不改）
scripts/                                  架构 / 测试目录检查脚本
docs/                                     架构、接口方案、UI 规范与跨模块功能规范
supabase/                                 数据库迁移与 Edge Functions
```

## 2. 依赖规则

| 从 \ 到 | app | features | components / contexts / lib / hooks / utils |
| --- | --- | --- | --- |
| **app** | ✓ | 只经公开入口 `@/features/<名>` | ✓ |
| **features/A** | ✗ | 自己内部用相对路径；别的 Feature 只经 `@/features/<名>`；不绕回自己的入口 | ✓ |
| **共享层** | ✗ | ✗ | ✓（彼此之间无循环） |

另外：

- **运行时无循环**：任何文件之间的运行时导入（含动态 `import()`）不得成环；仅类型导入不算。
- **SDK 唯一持有者**：`three` 只在 `features/scene-3d`；`@/integrations/supabase/*` 只在 `lib/backend`。其余模块用 `@/lib/backend` 的 `backend()`（按需加载客户端）、`requireUserId()`、`readPage()`；启动即创建的会话客户端 `@/lib/backend/supabase` 只给登录会话 `features/projects/hooks/use-projects.ts`。
- 不写 `export * from`；公开入口逐个具名导出。
- 测试（`__tests__/`）不受公开入口限制，可以直接导入被测模块。

## 3. Feature

### 3.1 目录

```
features/<名>/
├── README.md          职责、公开入口、目录、依赖、必须遵守的规则（必备）
├── plan.md            现状与后续计划（必备）
├── index.ts           公开入口：别的模块只能从这里取
├── components/        界面（PascalCase 组件，文件 kebab-case）
├── hooks/             use-xxx
├── api/               后端读写（经 @/lib/backend）
├── model/             纯逻辑与静态数据
├── types.ts           仅本 Feature 用的类型（需要时）
└── __tests__/         本 Feature 的测试
```

按实际需要建目录，不为对称建空目录。

### 3.2 公开入口与按需加载

公开入口会被首屏包里的模块（编辑器、工作室页面）导入，所以**入口里不能静态导出较重的界面**，否则它们会被打进首屏包：

- 管理页、AI 弹窗、自定义家具弹窗这类较重或只在操作后才出现的界面，以 `lazy()` 组件导出（使用方放在 `<Suspense>` 里）；
- 点开后要立即给出反馈的弹窗，可以只静态导出轻量外壳，正文在 Feature 内部用 `lazy()` 加载（例：报告预览 `ReportDialog`，正文是 `report-content.tsx`）；
- 3D 场景、报告 PDF 这类大模块，以加载函数导出（`loadScene3D()`、`loadReportExport()`）；
- Hook、轻量组件、类型、接口函数直接导出。

新增导出后跑一次 `pnpm run build`，对比首屏 `index-*.js` 体积，确认没有把按需模块带进首屏包。

## 4. 共享层

| 模块 | 放什么 | 不放什么 |
| --- | --- | --- |
| `lib/floor-plan` | 多个 Feature 共用的户型领域规则与数据（按文件导入，例如 `@/lib/floor-plan/geometry`，不设汇总入口） | 只服务一个 Feature 的逻辑（放回那个 Feature 的 `model/`） |
| `lib/drawing` | 方案 → 与格式无关的图纸文档 → SVG / DXF / PDF；导出文件命名与中文字体 | 导出菜单等界面（在 `features/editor`） |
| `lib/backend` | Supabase 连接、列表接口、生成类型的出口 | 具体表的读写（放在各 Feature 的 `api/`） |
| `components/<组件>` | 至少两个 Feature 用到的界面 | 只有一个 Feature 用的组件 |
| `contexts/<能力>` | 由应用层提供 Provider 的全局能力及其完整实现 | |
| `hooks/`、`utils/` | 与业务无关的 Hook / 纯函数 | |

## 5. 统一分页列表

所有「列表」型数据（项目、账号家具与材料、风格、小助手，以及以后新增的列表）一律走同一套分页契约，不在前端一次读全再切页。

**接口**：数据库函数（`supabase/migrations`），返回统一 JSON：

```json
{ "list": [/* 当前页 */], "pagination": { "page": 1, "pageSize": 20, "total": 128 }, "counts": { "全部": 128, "奶油": 13 } }
```

- `page` 从 1 开始；`pageSize` 默认 20、上限 100，传 0 只取数量；
- `counts` 是各分类的条数，**不随当前所选分类与搜索词变化**，用来渲染筛选胶囊上的数字；
- 现有函数：`interior_project_page`、`interior_library_page`、`interior_assistant_page`，契约与执行方式见 `docs/api/paged-lists.md`。

**前端**：

- 契约类型在 `@/lib/paging`（`PageRequest`、`PageResult`、`PageSource`、`PAGE_SIZE = 20`）；调用函数用 `@/lib/backend` 的 `readPage(fn, args, request)`，各 Feature 在自己的 `api/` 里包一层（如 `projectPage`、`accountItemPage`、`accountStylePage`、`assistantPage`）；
- 页面状态只用 `@/hooks/use-paged-list`（首屏 20 条，滚动到底加载下一页：第 2 页 21–40、第 3 页 41–60……），列表底部放 `ListLoadMore`；
- 组件测试用 `@/hooks/use-paged-list.testing` 替身，接口测试用 `@/lib/backend/connection.testing` 替身；
- 只供下拉选择的小集合（新建风格的起点、AI 引擎）不分页。

## 6. 平台约定文件（位置固定）

Enter 平台与脚手架按固定路径读写这些文件，不移动、不改名：`index.html → src/main.tsx`、`src/analytics.ts`、`src/i18n/*`、`src/integrations/supabase/*`（自动生成）、`src/components/ui/*`（shadcn）、`src/lib/utils.ts`、`src/hooks/use-mobile.tsx`、`src/env.d.ts`。

## 7. 命名与测试

- 目录与文件名 kebab-case；组件名 PascalCase，Hook 以 `use` 开头。
- 测试统一用 Vitest，放在所属模块的 `__tests__/` 里；跨模块的用例放在主要被测对象所在模块。测试替身以 `.testing.ts` 结尾，与被替换的模块放在一起。

## 8. 检查

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test                 # vitest run src scripts
pnpm run lint
pnpm check:architecture   # 公开入口、共享层越界、SDK 持有者、运行时循环
pnpm check:test-layout    # 测试位置与框架
pnpm run build            # 对比首屏 index-*.js 体积
```
