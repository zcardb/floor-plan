# 家具管理改为成本管理的版式，加入硬装分类；删除成本管理

## 背景
- 「成本管理」与「家具管理」重复：删除成本管理，只保留家具管理。
- 家具管理的筛选、新建、下方展示完全按照成本管理的样子：搜索框 + 新建家具，硬装 / 软装两行，「全部单价 · N 项」与分块卡片。
- 新建弹窗的分类下拉加入 地面 / 墙面 / 门窗（硬装 / 软装分组）；墙面、门窗可完整新建：保存到账号库，项目里可直接选用，并计入成本。
- 分类超长时横向滚动。

## Implementation checklist
- [x] `AccountCMS` 导航仅「项目管理」「家具管理」，移除 `AccountCostManager` 引用；移动端 2 列
- [x] 家具管理采用成本管理版式：搜索 + 新建家具卡片框、硬装/软装两行、「全部单价」结果区、分块卡片
- [x] 硬装卡片 → `AccountCostDialog`；家具卡片 → `AccountFurnitureDialog`（内置家具可设单价）
- [x] 删除 `AccountCostManager.tsx` 与无引用 CSS
- [x] `hardMaterials.ts`：常量、类型、校验、`pickable*` / `apply*` 函数
- [x] `types.ts`：`customWalls`、`customOpenings`、`Opening.variant`、`openingPrices` 放宽
- [x] `costs.ts` / `costBreakdown.ts`：自定义墙面、门窗的单价回落与名称
- [x] `validation.ts`：新字段校验，旧项目兼容
- [x] migration：两张新表 + RLS + 本人策略
- [x] `useWallCatalog` / `useOpeningCatalog`：`load`、`save`
- [x] `newFurnitureCategory` 保留硬装分类
- [x] 弹窗：分组下拉 + 滚动；墙面 / 门窗表单；动态标题；项目内账号库列出墙面、门窗
- [x] `AccountCMS` 加载墙面、门窗目录并在新建后刷新
- [x] `Workbench`/`SelectionEditor`：墙面下拉含自定义；门窗款式选择
- [x] `accountCostEntries` / `accountCostSource` / `CostItemVisual` 支持自定义墙面、门窗
- [x] `CmsFilterBar`：单行横滚、按需渐隐、选中项滚入视野、滚轮转横向

## Verification checklist
- [x] 单测：账号页导航只有两个模块，不含「成本管理」
- [x] 单测：家具管理工具栏含搜索与「新建家具」；含「硬装分类」「软装分类」两组、9 个分类按钮；含「全部单价」
- [x] 单测：不同筛选下点新建，`onNew` 收到当前分类
- [x] 单测：`newFurnitureCategory('墙面'/'门窗'/'地面')` 原样保留，`('全部')` → 客厅
- [x] 单测：弹窗选「墙面」渲染 `CustomWallForm`、选「门窗」渲染 `CustomOpeningForm`
- [x] 单测：自定义门窗未覆盖价格时按其单价计入成本且名称正确
- [x] 单测：`validateDesign` 拒绝未知自定义 `wallMat`、kind 不一致的 `variant`；旧项目通过
- [x] 单测：`applyOpeningVariant` 能放下时同步宽度，否则保留原宽
- [x] `pnpm test`、`pnpm lint`、tsc、`pnpm run build` 全部通过
