# 管理端「页头 + 搜索 + 新建 + 筛选」重新设计（项目管理 / 账号家具库）

## Context
现在两个页面顶部的标题、搜索、新建、筛选是分开写的，样式和位置都不统一：
- **新建按钮位置不一样**：项目管理的新建按钮在页头右上角，家具库的放在搜索框右边。用户换一个页面就得重新找主按钮（违反 *Spatial Memory*、*Law of Similarity*）。
- **页头结构不一样**：家具库有小标题「工作室素材库」，项目管理没有。家具库的保存状态也挤在搜索栏里，和搜索没关系（违反 *Law of Proximity*）。
- **右上角两个按钮一样显眼**：「刷新」是带文字的大按钮，看起来和主按钮「新建项目」差不多重（违反 *Von Restorff*、*Visual Hierarchy*、*Hick's Law*）。
- **搜索缺少反馈**：输入后面板里看不到匹配了多少项，也没有提示可以用快捷键（违反 *Feedback Loop*、*Signifiers*）。
- **筛选结构不一样**：项目管理的「全部 / 内置 / 我的」是一行没有标签的胶囊；家具库则是「图标 + 分组名 + 项数 | 胶囊」的分行结构（违反 *Familiarity Bias*、*Law of Similarity*）。

**范围**：只改页头、搜索、新建、筛选面板。**下面的结果标题行、卡片网格、分页、空状态都不动。** 家具库「硬装 / 软装」两行分类原样保留，包括结构、文字、计数、顺序和点击行为。
> 说明：第二个问题你选了「卡片 + 紧凑列表切换」，但第一个问题你写了「下方列表不动」。这次按「列表不动」做，不加视图切换。如果需要切换，请在审阅时告诉我，我再加进计划。

参考的业界做法：Linear、Notion、Figma 的文件页都是标题在左、主操作固定在右上角；搜索框做得比较大，右侧显示快捷键或匹配数；筛选按带标签的分组排列。

---

## 设计方案

### 1. 统一页头 `CmsPageHeader`（两个页面用同一个组件）
```
 项目管理                                              家具库
┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│ 设计工作台                    [⟳]  [+ 新建项目 ▾] │   │ 工作室素材库        (✓ 已保存并生效)  [+ 新建家具] │
│ 项目管理                                     │   │ 账号家具库                                     │
│ 把每个空间的灵感，保存成独立方案。            │   │ 家具、地面、墙面…设好单价后各项目直接沿用。    │
└──────────────────────────────────────────────┘   └──────────────────────────────────────────────┘
```
- 两页都用「小标题 + 大标题 + 说明」。项目管理补上小标题「设计工作台」。依据 *Law of Similarity*、*Familiarity Bias*：两页结构一样，用户不用重新理解。
- 主按钮固定在右上角，高 36、圆角 8，两页一致。家具库的「新建家具」从搜索栏移到这里。依据 *Spatial Memory*、*Fitts's Law*：主按钮永远在同一个位置。
- 「刷新」改成只有图标的 36×36 描边按钮，鼠标悬停时显示提示，aria-label 为「刷新」，刷新时图标旋转。这样页面上只有一个显眼的主按钮。依据 *Von Restorff*、*Visual Hierarchy*。
- 家具库的保存状态（正在保存… / 修改尚未保存 / 已保存并生效）改成主按钮左边的小状态胶囊，没有状态时不显示。依据 *Feedback Loop*、*Law of Proximity*：保存状态反映的是整页的编辑结果，不属于搜索。

### 2. 搜索框 `CmsSearchField`（两页共用，取代现在重复的两份代码）
```
空闲：┌────────────────────────────────────────────────────────────┐
      │ 🔍  搜索材料、家具名称…                              [ / ] │
      └────────────────────────────────────────────────────────────┘
输入：┌────────────────────────────────────────────────────────────┐
      │ 🔍  沙发                                     匹配 6 项   ✕ │
      └────────────────────────────────────────────────────────────┘
加载：│ ◌  …（左侧图标换成转圈，aria-busy）                         │
```
- 高 44、圆角 10，背景用 `--canvas`，在卡片面板里自成一块。聚焦时显示主色描边和光晕，沿用现有 `cost-search:focus-within` 的样式。依据 *Law of Common Region*。
- 没有输入时，右侧显示 `/` 快捷键提示：在页面任何地方按 `/` 都会聚焦搜索框。以下情况不触发：焦点在输入框、文本域或可编辑区域里，或者有弹窗打开。触屏设备（`hover:none`）上不显示这个提示。依据 *Signifiers*、*Spark Effect*。
- 输入后，右侧实时显示「匹配 N 项」和清空按钮 ✕；在搜索框里按 `Esc` 也能清空。依据 *Feedback Loop*：用户不用往下滚就知道有没有结果。
- 匹配数直接用页面已经算好的结果（家具库 `visible.length`，项目管理 `entries.length`），不增加新的查询。

### 3. 筛选面板（两页统一为「标签列 + 胶囊行」）
```
 家具库（两行分类原样保留，只改面板外壳和上方的搜索区）
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 搜索材料、家具名称…                                    / ]   │
│──────────────────────────────────────────────────────────────────│
│ ◇ 硬装 25 项   (地面 9)(墙面 3)(门窗 2)(屋面 8)(吊顶 3)            │  ← 不动
│──────────────────────────────────────────────────────────────────│
│ ▢ 软装 64 项   (卧室 12)(客厅 16)(餐厨 12)(卫浴 9)(家电 9)(书房 6) │  ← 不动
└──────────────────────────────────────────────────────────────────┘

 项目管理（只有一行，套用同样的标签列结构）
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 搜索项目名称、户型…                                    / ]   │
│──────────────────────────────────────────────────────────────────│
│ ▦ 来源 12 项   (全部 12)(内置 6)(我的 6)                          │
└──────────────────────────────────────────────────────────────────┘
```
- 项目管理的「全部 / 内置 / 我的」放进和家具库一样的 `.cost-group` 结构：左边是 90px 宽的标签列（`LayoutGrid` 图标 + 「来源」+ 总数），右边是胶囊。依据 *Law of Similarity*、*Chunking*。
- 面板里去掉原来搜索栏中的按钮和保存状态，只剩「搜索 → 分隔线 → 分类行」，从上往下一路看下来。依据 *Cognitive Load*、*Visual Hierarchy*。
- `CmsFilterBar` 本身不改，横向滚动、两侧渐隐、选中项自动滚到可见区域都保留。

### 4. 移动端（≤700px）
```
┌──────────────────────────────┐
│ 工作室素材库                  │
│ 账号家具库                    │
│ 说明文字…                     │
│        (✓ 已保存)  [+ 新建家具] │  ← 操作区换到下一行，靠右
├──────────────────────────────┤
│ [🔍 搜索…            ✕]       │  高 44，不显示 / 提示
│ ◇ 硬装 25 项  (地面)(墙面)→   │  横向滚动（不变）
│ ▢ 软装 64 项  (卧室)(客厅)→   │
└──────────────────────────────┘
```

### 伦理检查
不制造紧迫感，不加「未定价进度条」这类催用户填写的设计，保留「按需设置，无需全部填写」这句提示；清空搜索和清空筛选随时可用。

---

## 涉及文件
- 新增 `src/features/interior/components/CmsPageHeader.tsx`：包含小标题、标题、说明，右侧留一个 `actions` 插槽。
- 新增 `src/features/interior/components/CmsSearchField.tsx`：props 为 `label / placeholder / value / onChange / loading / matchCount`，支持 `/` 快捷键和 Esc 清空。
- 修改 `src/features/interior/components/ProjectManager.tsx`：页头和搜索换成 `CmsPageHeader` + `CmsSearchField`；刷新改为图标按钮；来源筛选套上 `.cost-group` 标签列。结果标题行、卡片网格、分页、弹窗不改。
- 修改 `src/features/interior/components/AccountFurnitureLibrary.tsx`：页头换成 `CmsPageHeader`，「新建家具」和保存状态移到页头；搜索换成 `CmsSearchField`。`cost-group-columns` 两行和结果区不改。
- 修改 `src/features/interior/components/ManagementLoading.tsx`：家具库加载骨架里的按钮占位，从工具栏移到页头右侧。
- 修改 `src/index.css`：新增 `.cms-page-header*`、`.cms-search-field*`、`.cms-sync-pill`、`.cms-icon-button`；删除不再使用的 `.cost-new` 和搜索栏内的 `.cost-sync` 规则。只用已有的语义 token（`--primary / --accent / --canvas / --border / --ring / --destructive`）。
- 修改 `src/features/interior/components/managementUi.test.tsx`：更新「新建家具在工具栏内」的断言，并补充新断言。

复用的现有代码：`CmsFilterBar`、`EditorTooltip`、`Button`，样式 `.cost-controls`、`.cost-group*`、`.cost-search:focus-within`，以及 `filterCostEntries` / `filterProjects` 已算出的结果数量。

## Implementation checklist
- [x] `CmsPageHeader` 显示小标题、h1 标题、说明，以及右侧的 `actions`；≤700px 时操作区换行并靠右
- [x] `CmsSearchField`：加载中显示转圈并设 `aria-busy`；为空时显示 `/` 提示；有内容时显示「匹配 N 项」和清空按钮（aria-label「清空搜索」）
- [x] 按 `/` 聚焦搜索框；焦点在 input、textarea、contenteditable 里，或页面上有 `[role=dialog]` 时不触发；组件卸载时移除监听
- [x] 搜索框里有内容时，按 Esc 清空
- [x] ProjectManager：页头使用 `CmsPageHeader`，小标题为「设计工作台」；刷新改为图标按钮 `cms-refresh-button`，aria-label「刷新」，放在「新建项目 ▾」左边
- [x] ProjectManager：来源胶囊包进 `.cost-group`，标签列显示 `LayoutGrid` 图标、「来源」和总数；保留 `aria-label="项目分类"`
- [x] AccountFurnitureLibrary：「新建家具」移到页头 actions；`locked` 时禁用，`onNew(category)` 行为不变
- [x] AccountFurnitureLibrary：保存状态胶囊放在页头主按钮左边，三种状态的文案不变，没有状态时不渲染
- [x] AccountFurnitureLibrary：`cost-group-columns` 和硬装 / 软装两行的 DOM、`pick` 行为完全不变
- [x] 结果标题行、`cms-category-block`、`cms-project-grid`、分页、空状态的 DOM 和样式都不改
- [x] ManagementLoading 家具库骨架：按钮占位放在页头右侧，工具栏只保留搜索占位
- [x] index.css 加入新类名并删除废弃规则；不出现写死的颜色值

## Verification checklist
- [x] 正向：家具库 HTML 中「新建家具」出现在 `cost-controls` 之前（在页头里），搜索区不再包含「新建家具」
- [x] 正向：项目管理 HTML 中 `cms-refresh-button` 出现在「新建项目」之前，并带 `aria-label="刷新"`
- [x] 正向：项目管理的筛选行包含「来源」标签和 `aria-label="项目分类"`；全部 / 内置 / 我的的计数断言仍然通过
- [x] 正向：`CmsSearchField` 传入 `value="沙发" matchCount={6}` 时显示「匹配 6 项」和清空按钮；值为空时显示 `/` 提示
- [x] 负向：家具库硬装 / 软装两行的现有断言全部通过（分组 aria-label、标签不是按钮、每个分类后面跟 `<b>`）
- [x] 负向：没有保存状态时，页面不渲染状态胶囊
- [x] 边界：加载中时搜索框带 `aria-busy="true"` 并显示转圈
- [ ] （未执行：管理页需登录）截图：在 `desktop_1280` 和 `mobile_390` 下各看一次家具库页面，确认页头、搜索和两行分类的排布
- [x] 运行 `pnpm vitest run src/features/interior/components/managementUi.test.tsx`、`pnpm run lint`、`pnpm run build`
