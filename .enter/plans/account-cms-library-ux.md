# 账号家具库 / 账号默认成本：分类浏览 + 弹窗编辑（含 UX 心理学设计约束）

## Context

账号管理后台（登录后的 CMS）两个页面目前体验不一致：

- **账号家具库**（图 12）：只显示用户自定义家具（`interior_furniture_catalog`），内置的 78 款默认家具（`data/catalog.ts` 的 `library`：卧室/客厅/餐厨/卫浴/家电/书房）完全没有出现，所以新账号看到的是「0 款家具 + 还没有自定义家具」空状态。顶部那排分类统计是静态文字，点了没反应。
- **账号默认成本**（图 13）：五组价格平铺成五列超长列表，条目全部展开（地面材料还内嵌采购规格编辑器），一屏看不到全貌，无法按分类定位，视觉拥挤。

目标：两边统一成「分类筛选条 + 卡片网格 + 点击卡片弹窗编辑」，家具库补齐内置默认家具并与自定义家具合并展示。

用户已确认：家具库内置+自定义合并、分类筛选、自定义带「自定义」标记；点击卡片开详情弹窗（自定义可改价/删除，内置只读）；卡片价格自定义显示自定义价、内置显示「内置参考」价；成本页顶部分类筛选条 + 卡片网格 + 点卡片弹窗改价（地面含采购规格），保留「保存账号默认」。

设计参考（用户指定）：growth.design/psychology 的 106 条认知偏差与设计原则清单，以及 growth.design 案例库（案例页主推「劳动感知偏差 Labor Illusion：为什么更快并不总是更好」）。

## 设计原则 → 具体落地（本计划的硬约束）

| 原则 | 落地做法 |
| --- | --- |
| **渐进披露 Progressive Disclosure** | 列表卡片只给概览（名称 / 单位 / 价格 / 来源徽标）；采购规格、数值输入等复杂操作全部进入点击后的弹窗 |
| **希克定律 Hick's Law** | 分类筛选条把 78+ 条内置家具（成本页 5 组 90+ 条）切成小集合；默认进入「全部」但按分类**分块**呈现，避免一次性铺 78 张卡 |
| **分块 Chunking / 邻近性 Law of Proximity** | 「全部」视图按 6 个分类分块（组标题 + 数量 + 网格）；成本页按 5 组切分；组内条目用统一卡片节律对齐 |
| **冯·雷斯托夫效应 Von Restorff** | 自定义家具排在各组最前并使用 accent 色「自定义」徽标；内置条目用中性「内置」徽标，视觉权重更低 |
| **劳动幻觉 Labor Illusion / 目标趋近 Goal Gradient** | 成本页顶部常驻进度：「已定价 x / 共 y 项」+ 「未定价 z 项待填写」；筛选条每个分类的 meta 显示「x/y 已定价」，让进度可见 |
| **蔡加尼克效应 Zeigarnik** | 未定价条目在卡片上以 `未定价` 中性 chip 呈现（不隐藏、不阻塞），并在顶部汇总数量，形成温和的完成动机 |
| **反馈循环 Feedback Loop** | 改价/应用采购规格后卡片立即更新；「保存账号默认」「删除家具」给出 role=status / form-error 明确结果；保存中按钮禁用并显示进行中文案 |
| **费茨定律 Fitts's Law** | 整张卡片是 `<button>` 点击目标（桌面 ≥200px 宽、视觉高度 ≥130px，移动端单列），弹窗主操作按钮全宽 |
| **识别优于回忆 Recognition over Recall** | 卡片直接标注来源（自定义 / 内置 / 账号默认 / 内置参考）与内置参考价，用户不必记住价格来自哪里 |
| **默认偏误 Default Bias / 损失厌恶** | 不引入新的必填步骤；空值一律显示「未定价」而非空白；账号默认价仍按「项目未单独调价即继承」的既有语义，不改计算 |
| **美学-可用性效应 Aesthetic-Usability** | 统一卡片系统（同一套圆角/描边/hover 抬升/阴影 token）、语义色板、tabular-nums 对齐数字；不使用 emoji，图标一律 lucide-react |
| **心智模型 / 熟悉度 Familiarity** | 复用项目内既有素材库交互（`Library.tsx` 的搜索框 + 分类 chip + 卡片网格）与既有 shadcn Dialog/Button，账号后台与工作台体验一致 |

## 数据与复用要点

- 内置家具：`library` / `categories`（`src/features/interior/data/catalog.ts`）；内置条目无 `price`，「内置参考价」取自账号默认成本的 `furniturePrices[catalogId]`（即成本页「家具款式」组填的价）。
- 自定义家具：`useFurnitureCatalog()` 提供 `items / count / counts / hasMore / load / save / reset`，本次新增 `remove(catalogId)`（RLS `interior_catalog_own` 已允许本人删除，**无需迁移**）。
- 成本草稿：沿用现状——`draft` 塞进 `{...referenceDesign(), customCatalog: items, costSettings: draft}`，复用模型层 `priceOf / setPrice`（`model/costs.ts`）。
- 编辑器与原子组件复用：`PriceInput`、`MaterialProcurementEditor`、`FurnitureShape`、`@/components/ui/dialog`、`@/components/ui/alert-dialog`、`@/components/ui/button`。
- 不做：不新增表/迁移，不改成本计算与 `costDefaults` 模型，不做家具名称/尺寸/图片编辑。

## 改动

### 1. 新增 `CmsFilterBar.tsx`（两侧共用）

```tsx
export function CmsFilterBar({ chips, value, onChange }: {
  chips: { id: string; label: string; meta?: string }[];
  value: string;
  onChange: (id: string) => void;
})
```
`.cms-filter-bar` 内渲染 `<button>`，选中加 `active`；`meta`（如「78 款」/「3/8」）以 `<b>` 跟在标签后，`aria-pressed` 同步。

### 2. 新增 `AccountFurnitureLibrary.tsx`（家具管理标签页）

Props：`{ catalog, defaults: AccountCostSettings, onNew }`。

- 状态：`category`（默认 `'全部'`）、`query`、`detail: LibraryItem | null`。
- 合并列表：`[...catalog.items, ...library]`，按 `catalogId` 去重（自定义优先）；`customIds = useMemo(Set)` 用于徽标与弹窗权限。
- 工具行：搜索框（复用 `Library.tsx` 的 `.library-search` 结构与 `name.includes(query)` 语义，`aria-label="搜索家具"`）+ `CmsFilterBar`（`全部` 与 6 分类，meta 为「内置款数 + 服务端自定义 `catalog.counts`」之和的「n 款」）。
- 内容区（渐进披露 + 分块）：
  - 搜索中：跨分类单网格，标题「搜索结果 n 件」。
  - 选具体分类：该分类单网格。
  - 「全部」：按 `categories` 顺序分块，每块 `<h2>{分类} <span>{n} 款</span></h2>` + 网格；块内自定义在前、内置在后。
- 卡片 `.cms-item-card`（整卡 button）：
  - 视觉区复用现有写法：`imageUrl` → `<img crossOrigin="anonymous" loading="lazy" alt={name}>`，否则 `<FurnitureShape>` SVG（viewBox 同现实现）；视觉区左上角徽标 `自定义`（`.cms-item-badge.custom`，accent 色）/ `内置`（中性）。
  - 文案：名称 / `{category} · {w} × {d} mm` / 价格行：自定义 `¥{price}` 或 `未定价`；内置 `参考价 ¥{furniturePrices[catalogId]}` 或 `未定价`。
- 空状态：筛选/搜索结果为空时「该分类暂无家具。」；删除原「还没有自定义家具」整块空状态。
- 「加载更多家具」（`load(true)`，只追加自定义）保留在网格下方；`catalog.loading` 显示「正在读取家具…」，`catalog.error` 用 `role="alert"`。
- 副标题：`{library.length + catalog.count} 款家具 · 内置 {library.length} 款 + 自定义 {catalog.count} 款（款式数，不是项目摆放件数）`。

### 3. 新增 `AccountFurnitureDialog.tsx`（家具详情弹窗）

Props：`{ item, isCustom, referencePrice, saving, error, onOpenChange, save, remove }`。

- 布局：左视觉大图（img 或 SVG）/ 右侧信息：名称、分类、`宽 × 深 × 高 mm`、来源（自定义 / 内置）。
- 自定义：`PriceInput`（`label={name+'账号默认单价'}`，`key` 带当前值以重置内部输入态）→ `save({...item, price})`（upsert）；错误用 `form-error`，成功即时反映到卡片。
- 删除：`AlertDialog` 二次确认（沿用 `ProjectManager` 写法）→ `await remove(catalogId)`，成功后关闭并刷新列表；失败展示错误且不关闭。
- 内置：价格只读 + 提示「单价请在『成本管理 · 家具款式』中设置」，无删除按钮。
- 底部「完成」按钮关闭弹窗（峰终定律：以明确结束动作收尾）。

### 4. 新增 `AccountCostDialog.tsx`（成本条目弹窗）

Props：`{ group, key, name, groupTitle, unit, design, change, onDone }`。

- 头部：`{name}` + `{groupTitle} · 元 / {unit}`。
- `PriceInput`（`onApply={v => change(d => setPrice(d, group, key, v))}`，`key` 同值重置）。
- `group === 'floorPrices'` 时内嵌 `MaterialProcurementEditor`（`design`/`change` 透传，保留净面积/含损耗/实购的既有反馈 → 劳动幻觉）。
- 底部「完成」按钮；`draft` 仍由 `AccountCostManager` 持有，关闭后卡片价格即时刷新。

### 5. 改写 `AccountCostManager.tsx`

- 新增状态 `category`（默认 `'全部'`）与 `editing: {group,key,name,unit}|null`；`draft/saved/save/change` 逻辑与「保存账号默认」按钮保持不变。
- `groups` 定义保留（地面材料/墙面材料/门窗/墙体施工/家具款式）；「家具款式」条目仍为 `[...items, ...library]` 去重（自定义优先）。
- 顶部新增进度行（role=status）：`已定价 {x} / 共 {y} 项`，`未定价 {y-x} 项` 时附一句待填写提示。
- `CmsFilterBar`：`全部` + 5 组，meta 为该组「已定价 / 总条数」。
- 单网格卡片 `.cms-item-card.cms-item-card--cost`：组名小字、名称、`元 / 单位`、大号价格（`priceOf(design, group, key)` 或 `未定价`）、来源徽标（`typeof draft[group]?.[key] === 'number'` → `账号默认`，否则 `内置参考`）、「点击调整」弱提示。
- 点击卡片 → `setEditing(...)` 打开 `AccountCostDialog`；旧 `.cms-cost-grid` + 内联 `cost-detail` 标记全部移除。

### 6. `AccountCMS.tsx` 精简

保留 `modules`、侧边栏、`tab/creating` 与 `useFurnitureCatalog` 的加载/重置 `useEffect`；家具页渲染 `<AccountFurnitureLibrary catalog={catalog} defaults={costs.settings} onNew={()=>setCreating(true)}/>`；成本页保持 `<AccountCostManager key={projects.session?.user.id} ... items={catalog.items}/>`（`key` 防切换账号串草稿）。

### 7. `useFurnitureCatalog.ts` 增加 `remove`

```ts
const remove = useCallback(async (catalogId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('请先登录');
  const { error } = await supabase.from('interior_furniture_catalog')
    .delete().eq('owner_id', session.user.id).eq('catalog_id', catalogId);
  if (error) throw new Error(error.message);
  return true;
}, []);
```
并在返回值导出 `remove`。

### 8. `src/index.css`（`@layer components`，全部走语义 token）

- 新增：`.cms-filter-bar`（胶囊 chip，含 `button.active` / `b` meta）、`.cms-toolbar`（搜索框 + 筛选条一行，窄屏换行）、`.cms-category-block`（分块标题 + 计数）、`.cms-progress`（已定价/未定价进度行）、`.cms-item-grid`（`repeat(auto-fill,minmax(200px,1fr))`）、`.cms-item-card`（`:hover` 抬升 + `--shadow-float`，`--cost` 修饰符放大价格）、`.cms-item-visual`、`.cms-item-badge` / `.cms-item-badge.custom`、`.cms-detail-dialog`（图 + 信息两列，窄屏单列）。
- 删除无引用：`.cms-cost-grid`、`.cms-category-counts`（`cms-project-grid` 仍被 `ProjectManager` 使用，保留）。
- `@media(max-width:700px)` 追加：工具行换行、`.cms-item-grid` 单/双列、`.cms-detail-dialog` 单列、chip 与按钮触控高度 ≥ 40px。

## 关键文件

- 新增：`src/features/interior/components/CmsFilterBar.tsx`、`AccountFurnitureLibrary.tsx`、`AccountFurnitureDialog.tsx`、`AccountCostDialog.tsx`
- 修改：`src/features/interior/components/AccountCMS.tsx`、`AccountCostManager.tsx`、`src/features/interior/cloud/useFurnitureCatalog.ts`、`src/index.css`

## Implementation checklist（已完成项）

- [x] `useFurnitureCatalog` 导出 `remove(catalogId)`：按 `owner_id + catalog_id` 删除，后端错误信息原样抛出。
- [x] `CmsFilterBar` 渲染「全部」与传入 chips，选中项带 `active` 与 `aria-pressed`，`meta` 显示在标签后。
- [x] `AccountCMS` 家具页渲染 `AccountFurnitureLibrary`，传入 `costs.settings` 作为内置参考价来源。
- [x] 家具合并列表按 `catalogId` 去重且自定义优先；自定义带 accent 色「自定义」徽标，内置带中性「内置」徽标。
- [x] 家具「全部」视图按 6 个分类分块，每块显示分类名与款数，自定义条目排在该块最前。
- [x] 家具选择具体分类只显示该分类条目；搜索时跨分类显示「搜索结果」；结果为空显示「没有匹配的家具」。
- [x] 家具卡片价格行：自定义显示自身 `price`（含 `0`）或 `未定价`；内置显示 `furniturePrices[catalogId]` 参考价或 `未定价`。
- [x] 家具副标题显示「内置 78 + 自定义 n」总款数，「加载更多家具」仍调用 `load(true)`。
- [x] 内置家具点击 → 详情弹窗只读，含「单价请在成本管理中设置」提示且无删除按钮。
- [x] 自定义家具点击 → 详情弹窗可改单价（`catalog.save` upsert 并即时更新卡片），可在 AlertDialog 确认后删除；取消不删除。
- [x] `AccountCostManager` 顶部进度行显示「已定价 x / 共 y」并在有未定价项时给出提示文案。
- [x] 成本筛选条 meta 显示每组「已定价 / 总条数」，切换分类只渲染该组卡片。
- [x] 成本卡片显示组名、名称、`元 / 单位`、大号价格与来源徽标（账号默认 / 内置参考）。
- [x] 点击成本卡片 → `AccountCostDialog` 改价经 `setPrice` 写入 `draft`，关闭弹窗后卡片即时显示新价。
- [x] 地面材料弹窗内嵌 `MaterialProcurementEditor`，应用采购规格后 `draft.procurement` 更新且「保存账号默认」可持久化。
- [x] 「家具款式」组仍合并自定义 + 内置家具，`catalogId` 重复时自定义优先。
- [x] 「保存账号默认」按钮、保存中/已保存/错误状态与 `saved` 重置行为与现状一致。
- [x] 新样式全部使用语义 token（`hsl(var(--...))`），无硬编码颜色、无 emoji 图标（图标均为 lucide-react）。
- [x] `index.css` 新增 `.cms-filter-bar/.cms-toolbar/.cms-category-block/.cms-progress/.cms-item-grid/.cms-item-card/.cms-item-visual/.cms-item-badge/.cms-detail-dialog`，删除 `.cms-cost-grid/.cms-category-counts`，并在 700px 断点补齐移动端规则。
- [x] 全仓 `src/**` 中不再有 `cms-cost-grid`、`cms-category-counts`、`cms-furniture-visual` 的引用（grep 无匹配）。

## Verification checklist

- [x] `pnpm lint` 通过。
- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm test`（`vitest run src/features/interior`）33 个用例全部通过（模型层未改动）。
- [x] `pnpm run build` 成功。
- [ ] 正常路径（需登录，人工确认）：登录 → 家具管理，「全部」按 6 个分类分块，每块款数 = 内置款数 + 已加载自定义款数；切到「客厅」只显示客厅家具。
- [ ] 正常路径（需登录，人工确认）：家具搜索「沙发」跨分类命中；清空搜索回到分块视图。
- [ ] 正常路径（需登录，人工确认）：成本管理点「墙面材料 → 乳胶漆」弹窗改价 → 卡片显示「账号默认」与新区值、进度行「已定价」+1 →「保存账号默认」→ 刷新页面仍为新值。
- [ ] 默认路径（需登录，人工确认）：新账号家具库不再出现「还没有自定义家具」空状态，而是内置家具分块网格；空搜索/空分类显示新空状态。
- [ ] 边界（需登录，人工确认）：地面材料弹窗内应用采购规格（800×800、损耗 5%）后单位随 `draft.procurement` 变化；清空单价后卡片显示 `未定价`。
- [ ] 边界（需登录，人工确认）：自定义家具填价 0 显示 `¥0`（不是 `未定价`）；删除自定义家具时点「取消」不会删除。
- [ ] 响应式：账号区（家具库/成本页）与详情弹窗在 `desktop_1280` 与 `mobile_390` 下的表现——账号区必须登录，截图工具无登录态，故**未做自动截图验证**，需在预览中人工确认。
