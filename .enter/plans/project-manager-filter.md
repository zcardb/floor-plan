# 项目管理：分类 Tab + 搜索 + 分页

## 背景
项目管理页现在把「内置户型模板」和「我的项目」两段平铺，没有筛选、搜索和分页，项目多了很难找。本次改动：
- 分类改为 **全部 / 内置 / 我的** 三个 Tab，直接复用账号家具库已有的胶囊组件 `CmsFilterBar`（同截图：胶囊加数量），保证 UI 一致。
- 默认显示「全部」，内置模板和我的项目放在同一个网格里，**按修改时间倒序**排列。
- 增加搜索框和分页。

参考的设计法则（Growth.Design）：希克定律（只保留 3 个选项，默认「全部」）、系统状态可见（Tab 带数量，结果标题显示条数和页码）、认知优先于回忆（搜索也匹配户型描述）、空状态给出路（提供「清空筛选」）。

## 方案

### 1. 新增纯函数 `src/features/interior/model/projectFilter.ts`
- `type ProjectScope = 'all' | 'builtin' | 'mine'`
- `ProjectEntry = { kind: 'builtin'; preset } | { kind: 'mine'; row: ProjectSummary }`
- `filterProjects(entries, scope, query)`：
  - 搜索去掉首尾空格、不区分大小写。内置模板匹配名称、户型、描述；我的项目匹配名称。
  - 排序：我的项目按 `updatedAt` 倒序。内置模板没有修改时间，固定排在我的项目之后，内部保持原有顺序。
- `paginate(list, page, size)`：返回当页条目、总页数，并把页码修正到有效范围。

### 2. 新增 `src/features/interior/components/ProjectPagination.tsx`
- 「上一页」、页码、「下一页」，使用现有的 `Button`（ghost/outline 变体）和语义 token。只有 1 页时不渲染。
- 云端还有未加载的项目（`hasMore`）且当前在最后一页时，「下一页」仍可点：先调 `projects.loadMore()`，加载完再翻页，加载中显示 loading。原来底部的「加载更多」按钮由它替代。

### 3. `ProjectManager.tsx`
- 状态：`scope`（默认 `all`）、`query`、`page`。切换 Tab 或修改搜索时回到第 1 页。
- 标题下方放筛选面板，复用家具库的类名：`cost-controls` > `cost-toolbar` > `cms-search cost-search`（搜索框，有内容时显示清空 X），下面一行 `CmsFilterBar`，胶囊为「全部 N / 内置 N / 我的 N」。`hasMore` 时数量显示为 `N+`。
- 结果标题用 `cost-results-heading`：「全部项目 · N 项 · 第 x / y 页」；有筛选时右侧显示「查看全部」。
- 统一使用一个 `cms-project-grid`，每页 12 条：内置项渲染内置模板卡片（缩略图、只读预览、用此模板新建），我的项目渲染现有的项目卡片（打开、重命名、复制、删除，逻辑不变）。
- 空态：没有搜索词时，保留现有的加载骨架、读取失败、「还没有设计项目」；有搜索词但无结果时，显示「没有匹配的项目」和「清空筛选」。

### 4. `BuiltinTemplates.tsx`
- 拆出单卡组件 `BuiltinTemplateCard`，供统一网格使用。删除原来整段的 `BuiltinTemplates` 区块。

### 5. `src/index.css`
- 给内置模板卡片补上样式（目前没有样式），与 `cms-card` 和 `cms-item-card` 一致：边框、12px 圆角、`--canvas` 底色的缩略图、hover 浮起，「内置模板」徽标复用 `cms-item-badge`。
- 新增 `.project-pagination` 样式，居中排列。≤700px 时按钮 44px 高，与家具库移动端规则一致。

## 不改动
新建、导入、刷新、打开、复制、重命名、删除的逻辑和按钮位置；`useProjects` 的数据接口。

## Implementation checklist
- [ ] `projectFilter.ts`：`filterProjects` 支持三种 scope、搜索，按 updatedAt 倒序排列，内置排在我的项目之后
- [ ] `projectFilter.ts`：`paginate` 返回当页条目和总页数，页码越界时自动修正
- [ ] `ProjectPagination.tsx`：上一页、页码、下一页；只有 1 页时隐藏；`hasMore` 时最后一页点「下一页」会先 loadMore 再翻页
- [ ] `ProjectManager`：搜索框和「全部 / 内置 / 我的」`CmsFilterBar`（带数量，`hasMore` 时为 `N+`），默认全部
- [ ] `ProjectManager`：统一网格每页 12 条，切换 Tab 或搜索时重置到第 1 页，删掉原来的「加载更多」
- [ ] `ProjectManager`：保留无搜索时的加载、错误、空态分支；有搜索无结果时显示「清空筛选」
- [ ] `BuiltinTemplates.tsx`：导出 `BuiltinTemplateCard`
- [ ] `index.css`：内置卡片和分页样式只用语义 token，包含移动端规则

## Verification checklist
- [ ] `projectFilter.test.ts`：三种 scope；名称和描述都能命中；大小写不敏感；排序为我的项目按时间倒序、内置在后；分页边界（空列表、页码越界）
- [ ] `managementUi.test.tsx`：渲染三个 Tab 和搜索框；原有用例（刷新在新建左侧、空态、读取失败、行操作、DXF 弹窗）全部通过；超过 12 条时出现分页，1 页时不出现
- [ ] `pnpm test`、`pnpm run lint`、`pnpm run build` 通过
- [ ] 截图核对项目管理页 desktop_1280 和 mobile_390，与账号家具库的版式一致
