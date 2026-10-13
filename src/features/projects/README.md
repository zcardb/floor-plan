# projects · 项目与会话

## 职责

登录会话与项目的保存：云端项目（自动保存、乐观并发版本号）、游客本机草稿、内置模板；项目管理页（`/projects`，卡片、搜索、分类、新建 / 重命名 / 复制 / 删除）；编辑器顶栏的项目菜单（切换项目、新建项目）；新建项目的各种方式（模板、空白、导入 DXF / JSON、AI 生成）。

## 公开入口

- `useProjects()`：会话与项目状态（工作室页面持有唯一实例），类型 `ProjectSummary`、`SaveStatus`
- `projectPage(request, filters)`：云端项目分页列表（`interior_project_page`）
- `ProjectMenu` 与类型 `ProjectNavigation`：编辑器顶栏项目菜单
- `ProjectManager`：项目管理页（lazy）
- 类型 `NewProjectInput`：新建项目的输入（AI 新建项目也产出它）

## 目录

`api/`（`project-pages.ts` 列表接口、`guest-store.ts` 游客草稿）、`hooks/`（`use-projects.ts`、`use-project-creation.tsx`、`use-project-import.ts`）、`components/`（项目管理页、项目卡片与菜单、新建项目弹窗）、`model/`（筛选、模板状态、卡片操作）。

## 规则

- 会话客户端只在 `use-projects.ts` 里用（`@/lib/backend/supabase`，启动即订阅登录态）；其余读写走 `@/lib/backend`。
- 列表遵守统一分页（`docs/architecture.md` §5）。
- 新建项目时 AI 新建、DXF 导入分别经 `ai-design`、`dxf-import` 的公开入口接入。
