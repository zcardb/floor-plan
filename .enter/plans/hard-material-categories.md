# 新建弹窗与家具管理加入硬装分类（地面 / 墙面 / 门窗）

## 背景
现在「新建家具」弹窗只有软装分类 + 地面；成本管理里已有「硬装：地面 / 墙面 / 门窗」，但墙面、门窗不能自定义。家具管理的筛选只有一行胶囊，没有硬装分组。
按你的选择：
- 新建弹窗的分类下拉按「硬装 / 软装」分组，选墙面、门窗时切换到对应表单，**完整新建**：保存到账号库，项目里能直接选用，也计入成本。
- 家具管理的筛选改成和成本管理一样的两行（硬装 / 软装），每行超长时横向滚动。

## 方案

### 1. 数据模型（新文件 `model/hardMaterials.ts`）
- `HARD_CATEGORIES = ['地面','墙面','门窗']`，`accountCostEntries.ts` 的 `materialCostCategories` 改为复用它。
- `CustomWall { key:'custom-<uuid>'; name; color; price:number|null }`（单价按 m²）。
- `CustomOpening { key; name; kind:'door'|'window'; width; height; price:number|null }`（单价按开口面积 m²，与现有门窗计价一致）。
- `Design.customWalls?`、`Design.customOpenings?`；`Opening.variant?: string`（指向自定义门窗款式，空则为标准门/窗）。
- 辅助函数：`wallMaterialsOf(d)`、`wallMaterialOf(d,key)`、`openingPriceKey(o)`（`o.variant ?? o.kind`）、`openingName(d,o)`、`validCustomWall`、`validCustomOpening`。
- `types.ts`：`openingPrices` 类型放宽为 `Record<string, number|null>`。

### 2. 成本与校验
- `costs.ts` `priceOf`：`wallPrices` / `openingPrices` 未覆盖时回落到自定义款式的单价；`calculateCosts` 中墙面名称用 `wallMaterialOf`，门窗按 `openingPriceKey` 分行、名称用 `openingName`。
- `costBreakdown.ts`（房间分摊、`selectionCost`）同样替换 `wallMaterials[...]` 和 `'门'/'窗'` 硬编码。
- `validation.ts`：校验 `customWalls` / `customOpenings`（≤500、合法、key 唯一）；`wallMat` 允许内置或自定义 key；`opening.variant` 必须存在且 `kind` 一致。

### 3. 后端（新 migration，不改动现有表）
- `interior_wall_catalog`、`interior_opening_catalog`：结构对齐 `interior_floor_catalog`（`owner_id default auth.uid()`、key 正则、名称 1~100、颜色 hex、价格 0~1e8 可空、门窗 `kind in (door,window)`、宽 100~10000、高 100~8000、`unique(owner_id,key)`），同一 migration 内开启 RLS，策略仅 `auth.uid() = owner_id`。
- 新 hooks `cloud/useWallCatalog.ts`、`cloud/useOpeningCatalog.ts`，与 `useFloorCatalog` 一致（`load` / `save`，epoch 防竞态）。

### 4. 新建弹窗 `CustomFurnitureDialog.tsx`
- 分类下拉：`SelectGroup` 「硬装」（地面/墙面/门窗）+ 分隔线 +「软装」（卧室…书房）；`SelectContent` 用 `position="popper"`，限制最大高度（不超过可用高度、约 320px）并可滚动。
- `newFurnitureCategory` 接受硬装分类（当前在「地面」筛选下点新建会错误回落为客厅）；`全部/自定义/空` 仍回落客厅。
- 新表单 `CustomWallForm.tsx`（名称、分类、颜色、单价 元/m²、色块预览）和 `CustomOpeningForm.tsx`（名称、分类、门/窗、宽、高、单价 元/m²、门窗图标预览），结构与 `CustomFloorForm` 一致（校验、错误提示、保存中禁用、项目内可勾选「同时添加到账号库」）。
- 标题随分类变化：「新建家具 / 新建地面 / 新建墙面 / 新建门窗」。
- 新增 props `onCreateWall` / `onCreateOpening`；项目内「账号家具库」标签页也列出账号墙面、门窗，可一键加入当前项目。

### 5. 编辑器内选用（`Workbench.tsx`、`SelectionEditor.tsx`、新 `model/openingVariant.ts`）
- `Workbench`：`saveCustomWall` / `saveCustomOpening` 追加到设计（去重）并提示。
- 房间「材质 → 墙面」下拉改用 `wallMaterialsOf(design)`，包含自定义墙面。
- 选中门/窗时工具条新增「款式」弹层：标准门/窗 + 同类自定义款式。`applyOpeningVariant(d,id,key)` 设置 `variant` 与高度；宽度仅在墙段放得下且不与其他门窗重叠时同步，否则保留原宽并提示。
- 工具条名称、单价编辑显示款式名称。

### 6. 账号管理页
- `AccountCMS.tsx`：加载墙面、门窗目录，传给两个页面；新建后各自刷新列表。
- 抽出共享组件 `CategoryGroupFilter.tsx`（硬装行 + 软装行，点击已选中项取消），`AccountCostManager` 改用它，`AccountFurnitureLibrary` 也用它。
- `AccountFurnitureLibrary.tsx`：搜索框旁保留「全部 / 自定义」，下方为硬装 / 软装两行；硬装卡片复用 `accountCostEntries` + `CostItemVisual`，标注「内置 / 自定义」与单价（提示单价在成本管理中调整）；顺序与筛选行一致（硬装在前）。
- `accountCostEntries` 纳入自定义墙面、门窗；`accountCostSource` 增加「账号墙面库 / 账号门窗库」；`CostItemVisual` 支持自定义墙面色块和门窗图标。

### 7. 超长分类横向滚动（`CmsFilterBar.tsx` + `index.css`）
- 新增 `scrollable` 模式：单行不换行、`overflow-x:auto`、`scroll-snap`、细滚动条。
- 左右边缘渐隐遮罩仅在该方向还有内容时出现（监听 scroll / resize 设置 `data-fade-start/end`），提示还能滑动。
- 选中项自动 `scrollIntoView({inline:'nearest'})`；鼠标纵向滚轮在溢出时转为横向滚动；键盘 Tab 聚焦会自动滚入视野；触控保持 44px 点击高度。
- 只用设计系统 token，不加硬编码颜色。

## 关键文件
- 新增：`model/hardMaterials.ts`、`model/openingVariant.ts`、`cloud/useWallCatalog.ts`、`cloud/useOpeningCatalog.ts`、`components/CustomWallForm.tsx`、`components/CustomOpeningForm.tsx`、`components/CategoryGroupFilter.tsx`、新 migration
- 修改：`model/types.ts`、`model/costs.ts`、`model/costBreakdown.ts`、`model/validation.ts`、`model/accountCostEntries.ts`、`model/newFurnitureCategory.ts`、`components/CustomFurnitureDialog.tsx`、`components/Workbench.tsx`、`components/SelectionEditor.tsx`、`components/AccountCMS.tsx`、`components/AccountFurnitureLibrary.tsx`、`components/AccountCostManager.tsx`、`components/CostItemVisual.tsx`、`components/CmsFilterBar.tsx`、`src/index.css`
- 不改：`src/integrations/supabase/*`（自动生成）、现有 `interior_*` 表及数据

## Implementation checklist
- [ ] `hardMaterials.ts`：`HARD_CATEGORIES`、`CustomWall`/`CustomOpening` 校验函数、`wallMaterialsOf`/`wallMaterialOf`/`openingPriceKey`/`openingName`
- [ ] `types.ts`：`customWalls`、`customOpenings`、`Opening.variant`，`openingPrices` 放宽为 string key
- [ ] `costs.ts` `priceOf` 对自定义墙面/门窗回落到其单价；`calculateCosts` 门窗按 `openingPriceKey` 分行并使用款式名称
- [ ] `costBreakdown.ts` 房间分摊与 `selectionCost` 使用 `wallMaterialOf` / `openingPriceKey` / `openingName`
- [ ] `validation.ts` 校验自定义墙面/门窗数组、`wallMat` 自定义 key、`variant` 存在且 kind 一致
- [ ] migration：创建 `interior_wall_catalog`、`interior_opening_catalog`，同一 migration 开启 RLS + owner 策略
- [ ] `useWallCatalog` / `useOpeningCatalog` 的 `load`、`save`（upsert on `owner_id,key`）
- [ ] `newFurnitureCategory` 保留 地面/墙面/门窗，`全部/自定义/空` 回落客厅
- [ ] 弹窗分类下拉分组（硬装 / 软装）+ 最大高度滚动；选墙面渲染 `CustomWallForm`，选门窗渲染 `CustomOpeningForm`；标题随分类变化
- [ ] 项目内「账号家具库」标签列出账号墙面、门窗并可加入项目
- [ ] `Workbench` 接入 `onCreateWall` / `onCreateOpening`，写入 `customWalls` / `customOpenings`
- [ ] 房间墙面下拉包含自定义墙面；门窗「款式」弹层 + `applyOpeningVariant`（宽度放不下/重叠时保留原宽并提示）
- [ ] `AccountCMS` 加载并传递墙面、门窗目录，新建后刷新对应列表
- [ ] `CategoryGroupFilter` 抽出并在成本管理、家具管理复用
- [ ] 家具管理展示硬装分组卡片（内置 + 自定义）与「全部 / 自定义」筛选
- [ ] `accountCostEntries` / `accountCostSource` / `CostItemVisual` 支持自定义墙面、门窗
- [ ] `CmsFilterBar` `scrollable`：单行横滚、边缘渐隐按需显示、选中项滚入视野、滚轮转横向

## Verification checklist
- [ ] 单测：`newFurnitureCategory('墙面')==='墙面'`、`('门窗')==='门窗'`、`('全部')==='客厅'`
- [ ] 单测：弹窗选「墙面」渲染 `CustomWallForm`，选「门窗」渲染 `CustomOpeningForm`，选「书房」仍提交 `category:'书房'`
- [ ] 单测：`AccountCMS` 中 `onCreateWall` / `onCreateOpening` 各触发一次对应 `load`
- [ ] 单测：家具管理在「墙面」筛选下显示自定义墙面名称；「门窗」筛选显示内置门、窗
- [ ] 单测：自定义门窗未覆盖价格时按其单价计入成本，名称为款式名；标准门窗行为不变
- [ ] 单测：`validateDesign` 拒绝不存在的 `wallMat` 自定义 key、kind 不一致的 `variant`；旧项目（无新字段）照常通过
- [ ] 单测：`applyOpeningVariant` 宽度可放下时同步，墙段不足或重叠时保留原宽
- [ ] 截图检查家具管理页 desktop_1280 与 mobile_390：两行分类、超长横滚、渐隐提示
- [ ] `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit -p tsconfig.app.json`、`pnpm run build` 全部通过
