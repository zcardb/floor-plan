# 管理端统一布局：筛选区与骨架屏对齐

## Context

管理端三个页面（项目管理 / 家具管理 / 小助手）现在各写各的外壳与筛选区：

- 左右 padding 不一致：家具管理的内容被 `.account-cost-page { max-width:1160px; margin:0 auto }` 居中压窄，项目管理、小助手则铺满 `.cms-main`，看起来两边留白不同。
- 侧栏 + 右侧面板的布局写在 `AccountCMS.tsx` 里，换页面时容易再走样。
- 筛选 UI 与交互不一致：项目管理是「大搜索框 + 卡片式筛选面板（来源 + 全部/内置/我的）」，家具管理是「搜索 + 硬装/软装两行胶囊」。用户要求：搜索与操作同一行、筛选另起一行；分类改用参考图 3 的胶囊形式（家具管理仍是硬装/软装两行，复用同一组件，左边保留「硬装/软装」这类描述标签）。

结论：抽出公共布局与公共筛选组件，三个页面共用；管理端内容宽度统一为**铺满**（去掉 1160px 上限）。

## 改动

### 1. 新增 `src/features/interior/components/CmsLayout.tsx`

管理端外壳，侧栏与右侧面板一次定义：

- `CmsLayout({ collapsed, sidebar, children })` → `<div className={'account-cms'…}><aside className="cms-sidebar">{sidebar}</aside><main className="cms-main">{children}</main></div>`。
- `CmsSidebar({ collapsed, email, tab, onTab, onLogout, loggingOut, onToggle })`：把 `AccountCMS` 里现在的品牌行、导航、账号 Popover 原样搬进来（含 `cms-collapse`、`account-popover`、`AccountAvatar`、`Logo`）。
- `CmsPage({ scrollKey?, children })`：页面内容容器，统一 `<div className="cms-page">`，负责去掉 `account-cost-page` 那种逐页宽度差。

`AccountCMS.tsx` 只保留状态与业务（collapsed / dirty / leaving / 各 catalog），渲染改为 `CmsLayout` + `<ManagementEntry>`，对外 props 与 DOM 上的 aria-label 不变（`newFurnitureCategory.test.tsx` 依赖 `家具管理` 等按钮 label）。

### 2. 筛选区统一（同结构，两行）

新增 `src/features/interior/components/CmsFilterGroup.tsx`：

```
<CmsFilterGroup icon label count chips value onChange ariaLabel />
```

- 行内结构：`.cms-filter-group` = 左侧 `.cms-filter-group-label`（15px 图标 + 分类名 + `N 项`），右侧 `CmsFilterBar`。
- 家具管理和项目管理都用它，不再各写一份 `cost-group` 结构。

三处页面结构统一为：

1. **第一行**：`.cms-page-toolbar`，左搜索、右操作（刷新 / 同步状态 / 新建）。
2. **第二行**：`.cms-filter-rows`，每组一行 `CmsFilterGroup`；家具管理是硬装、软装两行（不再用箱式面板和行间分隔线）。

页面改动：

- `ProjectManager.tsx`：搜索框搬进 `CmsPageHeader` 的 `actions` 之前（`cms-heading-actions` 里搜索 + 刷新 + 新建项目）；`cost-controls project-filter-panel` 换成 `.cms-filter-rows` + `CmsFilterGroup`（来源 / 全部 / 内置 / 我的）。刷新与滚动加载逻辑不动。
- `AccountFurnitureLibrary.tsx`：搜索框搬进页头操作行；`cost-controls` 换成 `.cms-filter-rows` + 两个 `CmsFilterGroup`（硬装、软装）；仍是「点已选项取消筛选」的行为。
- `AssistantManager.tsx`：只有页头（无搜索/筛选），包进 `CmsPage` 即可，宽度与另两页一致。

### 3. `src/index.css`

- 删 `.account-cost-page { max-width:1160px; margin:0 auto }`，新增 `.cms-page { display:block }`（铺满）。
- `.cms-main { padding:32px 36px }` 保留；窄屏 `22px 16px` 保留。
- 新增：`.cms-page-toolbar`（flex、gap 12px、margin-bottom 16px）、`.cms-search-field` 在工具行里改为一档尺寸（`flex:0 1 280px`、min-height 36px、圆角 8px），窄屏 `flex:1 1 100%` 换行。
- 新增 `.cms-filter-rows`（grid、gap 10px、margin-bottom 8px）、`.cms-filter-group`（grid 90px + 1fr，对齐现有 `cost-group` 的刻度）、`.cms-filter-group-label`（11px / 500 / `--muted-foreground`，与 `cost-group-label` 同刻度）。
- `.cms-filter-bar button` 改成参考图 3 的形态：`min-height:32px`、`padding:0 12px`、圆角 `--ctl-radius-in`（不再 999px）、默认 `border-color:hsl(var(--border))`、底色透明、文字 `--muted-foreground`；激活态用 `--accent` 底 + `--primary` 边框 + `--foreground` 文字；数量 `b` 用 `--fs-hint` 灰字。
- 清理不再使用的 `.cost-controls`、`.cost-toolbar`、`.cost-group-columns`、`.cost-group--hard/--soft`、`.project-filter-panel` 相关规则（保留 `.cost-search`：`CmsSearchField` 仍带这个类，用于输入框字号）。

### 4. 骨架屏（`ManagementLoading.tsx` + CSS）

骨架必须与真实版式一致：

- 页头行：`Heading actions={['search','icon','button']}`（项目管理）/ `['search','button']`（家具管理），新增 `cms-skeleton-search-inline`（`flex:0 1 280px`、36px 高、圆角 8px）。
- 筛选区：`FilterPanel` 不再用 `.cms-loading-panel`（箱式）与行间分隔线，改成 `.cms-loading-filter-rows` + 每组一行 `.cms-loading-group`（90px 标签 + 胶囊），胶囊骨架改成 32px、圆角 `--ctl-radius-in`。
- 结果行与卡片网格骨架不变。
- 窄屏规则同步更新（`.cms-loading-panel` 的 padding 规则删掉）。

### 5. `src/features/interior/UI_GUIDELINES.md`

新增一节「管理端页面」（放在 §5 之后）：

- 外壳统一用 `CmsLayout` / `CmsSidebar` / `CmsPage`，页面内容一律铺满 `.cms-main`（36px 内边距，窄屏 16px），禁止逐页写 `max-width`。
- 页头 `CmsPageHeader`：右侧操作行，「搜索 + 刷新/同步 + 主操作」同一行。
- 筛选：一律 `CmsFilterGroup` + `CmsFilterBar`，一行一组，左侧标签（图标 + 名称 + 数量）；胶囊 32px、圆角 `--ctl-radius-in`、激活态 `--accent`。
- 骨架：`ManagementLoading` 的 `projects` / `library` 变体必须与上述版式逐行对齐。

### 6. 测试

- `managementUi.test.tsx`：把 `cost-controls` / `cost-toolbar` / `cost-group-columns` / `cost-group-label` / `cost-results-heading` 相关切片断言改成新类名（`.cms-filter-rows`、`.cms-filter-group-label`、`.cms-page-toolbar`），并补一条「搜索在页头操作行、筛选在下一行」的结构断言；骨架断言从 `cms-loading-panel` 改成 `cms-loading-filter-rows`。
- `newFurnitureCategory.test.tsx`：只依赖按钮 aria-label 与 `AccountFurnitureLibrary` props，预期不用改；如 `AccountCMS` 拆分后 `nodes()` 遍历深度变化导致找不到 `新建家具` 按钮，按实际结果调整（该按钮通过 `actions` 插槽透传，`nodes()` 已遍历 `props.actions`）。

## 验证

- `pnpm exec tsc -p tsconfig.app.json --noEmit`（注意：`src/features/interior/model/wallFaces.ts` 有他人正在改的 `side0` 报错，与本次无关，只确认没有新增错误）
- `pnpm exec vitest run src/features/interior/components`（重点 `managementUi.test.tsx`、`newFurnitureCategory.test.tsx`）
- `pnpm run lint`、`pnpm run build`
- 预览：`/` 进入管理端（或直接看项目管理 tab）
  - 项目管理：搜索框与刷新、新建项目同一行；下一行为「来源 | 全部 13 / 内置 6 / 我的 7」胶囊；点胶囊切换、再点「查看全部」恢复。
  - 家具管理：搜索框与同步状态、新建家具同一行；下面两行分别是「硬装」「软装」胶囊；左右留白与项目管理一致（宽屏铺满，无 1160px 居中）。
  - 小助手：页头与卡片网格与另两页同宽。
  - 首屏加载时骨架屏逐行对齐新版式（页头搜索 + 两个按钮、两行胶囊、卡片网格）。
  - 窄屏 390：搜索框换行占满、胶囊横向滚动、无横向溢出。

## Implementation checklist

- [x] 新增 `CmsLayout.tsx`：`CmsLayout` / `CmsSidebar` / `CmsPage`
- [x] `AccountCMS.tsx` 改用 `CmsLayout`，删掉内联的侧栏与 `account-cms` 外壳，props 与 aria-label 不变
- [x] 新增 `CmsFilterGroup.tsx`：图标 + 分类名 + `N 项` + `CmsFilterBar`
- [x] `ProjectManager.tsx`：搜索搬进页头操作行，筛选区改为 `.cms-filter-rows` + `CmsFilterGroup`
- [x] `AccountFurnitureLibrary.tsx`：搜索搬进页头操作行，硬装/软装改成两行 `CmsFilterGroup`，去掉 `account-cost-page`
- [x] 小助手页面不再自带宽度样式：`CmsLayout` 统一包 `.cms-page`，三页铺满同一内边距
- [x] `index.css`：删 1160px 上限、新增工具栏/筛选行样式、`.cms-filter-bar button` 改为 32px 圆角胶囊、删除废弃的 `cost-*` 规则
- [x] `ManagementLoading.tsx`：页头行加搜索骨架，筛选区改两行结构，去掉箱式面板与分隔线
- [x] `index.css` 骨架部分：`.cms-loading-filter-rows` / 胶囊尺寸 / 窄屏规则同步
- [x] `UI_GUIDELINES.md` 新增管理端页面一节
- [x] `managementUi.test.tsx` 断言更新到新类名与结构

## Verification checklist

- [x] `pnpm exec tsc -p tsconfig.app.json --noEmit` 无新增错误（`wallFaces.ts` 既有 `side0` 报错除外）
- [x] `pnpm exec vitest run src/features/interior/components` 通过
- [x] `pnpm run lint`、`pnpm run build` 通过
- [x] 项目管理：搜索与刷新 / 新建项目同行（由服务端渲染断言覆盖），来源胶囊在下一行，`aria-label="项目分类"` 与默认 `全部` 保持
- [x] 家具管理：`aria-label="硬装分类"` / `"软装分类"` 仍各在一行（由服务端渲染断言覆盖），左侧标签为「硬装」「软装」加数量
- [ ] 三个页面在 1280 宽下内容左右边界一致（无居中窄栏）——**未在预览中验证**（管理端需要登录）
- [ ] 390 宽下搜索框换行占满、胶囊可横向滚动、页面无横向滚动条——**未在预览中验证**
- [x] `ManagementLoading` 的 `projects` / `library` 变体与真实版式逐行对齐（页头行含搜索骨架、筛选两行、结果行、卡片网格），且不含 `<button`
- [x] 刷新项目列表时（`refreshing`）骨架仍整页替换，不残留旧列表
