# 接入 shadcn 组件 + 重构项目管理卡片

## Context（为什么改）

1. 「新建你的家具」弹窗以及账号相关的弹窗/表单里，分类、参考模型等仍在使用浏览器原生 `<select>` / `<input>` / `<input type="checkbox">` / `<input type="color">`，样式靠 `src/index.css` 里的自定义规则硬撑（截图 1 中下拉展开就是系统原生列表）。需要统一改为 shadcn 组件，让弹窗与表单获得一致的交互与视觉（Radix Select 浮层、Input、Checkbox、Tabs、Popover）。
2. 「项目管理」卡片（截图 2）里同时存在「打开设计」按钮和右侧铅笔等图标按钮，语义重复；卡片上还有「本机」标签。改为：整张卡片可点击进入项目，去掉「打开设计」按钮与「本机」标签，仅保留 重命名 / 复制（本机为「上传到云端」）/ 删除 三个图标按钮。

用户已确认的范围：**家具弹窗 + 其他弹窗/表单**，画布属性面板、选择编辑器、成本/材料面板等密集工具 UI 不动；卡片保留三个图标按钮（本机项目仍用「上传到云端」图标区分）。

## 一、shadcn 组件接入

### 1. `src/features/interior/components/CustomFurnitureDialog.tsx`（核心）
- 分类 / 参考模型：`<select>` → `Select` + `SelectTrigger` + `SelectContent` + `SelectItem`（`SelectValue` 显示当前值，`onValueChange` 分别写 `setCategory` / `setType`；`categories` 与 `types` 数据源不变）。
- 名称 / 宽深高 / 价格：`<input>` → `Input`（配 `Label htmlFor` + `id`），紧凑尺寸用 className（如 `h-9 text-xs`），保留原有 `aria-label`、`maxLength`、`required`、`type="number"` 等约束。
- 「同时添加到账号家具库」：`<input type="checkbox">` → `Checkbox` + `Label`（`checked={account} onCheckedChange={setAccount}`）。
- 「新建家具 / 账号家具库」两个 `.project-tabs` 原生按钮 → `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`（`value={tab}`、`onValueChange` 里保留「切到账号库时 `void catalog.load()`」的行为；`accountOnly` 时不渲染 Tabs，只渲染表单）。
- 模型颜色：原生全宽 `<input type="color">` → `Popover` + `PopoverTrigger asChild`（`Button variant="outline"`，内含色块 + 当前色值文本）+ `PopoverContent` 内预设色板色块与自定义取色（沿用画面选择器已有的色板语言）。色板常量抽到新文件 `src/features/interior/data/palette.ts`（`FURNITURE_COLORS`），并让 `SelectionEditor.tsx` 改为引用它，删除其本地 `const colors`（纯去重，无视觉变化）。
- 禁用态：保留 `<fieldset disabled>` 语义，同时对 `Select` / `Input` / `Checkbox` 显式传 `disabled={ai.busy||saving||!!pending}`（原判断抽成局部常量 `locked`），以得到 shadcn 的 disabled 视觉。
- 表单提交、`create` / `finish` / `epoch` 竞态保护、`ai` / `catalog` 逻辑一行不改。

### 2. `src/features/interior/components/ProjectManager.tsx`（弹窗部分）
- 新建/重命名弹窗：项目名称 `<input>` → `Input` + `Label`；户型模板 `<select>` → `Select` / `SelectItem`（`blank` = 空白户型，`reference` = 参考户型）。
- 保留 `.cms-form` 容器与提交逻辑不变。

### 3. `src/features/interior/components/AccountFurnitureDialog.tsx`
- `.cms-primary-action` 原生按钮 → `Button`（「完成」，保留 busy 文案与 Loader2）；`.cms-danger-link` → `Button variant="ghost"` + 危险色文本（「删除家具」）。
- 两个按钮都加 `cms-detail-action` 类，供移动端媒体查询继续生效。

### 4. `src/features/interior/components/AccountCostDialog.tsx`
- `.cms-primary-action`「完成」→ `Button className="cms-detail-action"`。

### 5. `src/features/interior/components/AuthDialog.tsx`
- 邮箱 / 密码原生 `<input>` → `Input`，class 覆盖掉边框与内边距（`border-0 bg-transparent px-0 py-0 h-auto shadow-none focus-visible:ring-0 focus-visible:ring-offset-0`），保留外层图标容器 `.auth-field > div` 与原生校验属性（`type`、`required`、`minLength`、`autoComplete`、`name`）。

### 6. `src/features/interior/components/ProjectDialog.tsx`
- `.project-name-entry` 与 `.rename-inline` 里的原生 `<input>` → `Input`（补 `flex-1 min-w-0`），创建/重命名逻辑与模板选择卡片（`.template-options`）不动。

### 7. `src/index.css` 配套调整（关键，否则样式互相打架）
- **必须收窄（未分层 CSS 会压过 Tailwind utilities）**：`~2483` 的 `.custom-furniture-fields input, .custom-furniture-fields select, ...` 只保留 `input[type="color"]` 部分（`.procurement-fields` 部分原样保留，不在本次范围）。收窄后弹窗内的 shadcn `Input` / `SelectTrigger` 才由 Tailwind class 控制。
- `~299` 删除 `.cms-form input, .cms-form select` 规则（`cms-form` 仅被该弹窗使用），保留 `.cms-form, .cms-form label { display:grid; gap:12px }`；新增 `.cms-field { display:grid; gap:6px }`（label + 控件成组的间距）。
- `~1446` `.project-tabs button.active` → 改为 `.project-tabs button[data-state='active']`（Radix 状态属性），并给 `TabsList` / `TabsTrigger` 用 className 指定紧凑尺寸（`h-auto p-[3px] gap-[3px]`、`gap-[5px] px-2.5 py-1.5 text-[11px] max-[700px]:px-[7px] max-[700px]:text-[10px]`），尺寸细节不依赖旧 CSS。
- 新增（未分层区，与其它 `.custom-furniture-*` 同处）：`.furniture-color-trigger`、`.furniture-color-swatch`、`.furniture-color-grid`（含 `.selected` 状态），全部使用设计令牌（`hsl(var(--border))` / `hsl(var(--primary))` / `hsl(var(--ring))`）。
- 移动端媒体查询 `~199` 的 `.cms-primary-action,.cms-danger-link { justify-content:center }` → 改指向 `.cms-detail-action`。

## 二、项目管理卡片重构（`src/features/interior/components/ProjectManager.tsx`）

- 卡片改为整卡可点：`<article className="cms-card">` 内加一个铺满的遮罩按钮
  ```jsx
  <button type="button" className="cms-card-open" aria-label={`打开项目 ${row.name}`}
          onClick={async () => { if (await projects.open(row)) opened(); }} />
  ```
  仍然复用现有 `projects.open(row)` + `opened()` 链路。
- 删除「打开设计」`Button` 与 `<span className="cms-card-tag">本机</span>`。
- 三个操作改为 `Button variant="ghost" size="icon"`（`h-8 w-8`，`aria-label` 保留，`Pencil` / `Copy` 或 `Cloud` / `Trash2` 不变），放在 `.cms-card-actions` 内并置于遮罩之上，因此无需 `stopPropagation`。
- `src/index.css`：`.cms-card` 增加 `position:relative; transition:border-color .18s ease, box-shadow .18s ease;` 与 `:hover` 令牌化高亮（`hsl(var(--primary) / .35)` + `var(--shadow-float)`）；新增 `.cms-card-open { position:absolute; inset:0; z-index:1; cursor:pointer; border-radius:inherit }` 与 `.cms-card-open:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:2px }`；`.cms-card-actions { position:relative; z-index:2; gap:6px; margin-top:20px }`；删除 `.cms-card-tag` 与 `.cms-card-actions>button:not(:first-child)` 两条已失效规则。

## 非目标（本次不做）
- 画布右侧属性面板、选择编辑器、成本面板、材料采购编辑器里的原生控件（含 `SizeFields`、`PriceInput`、`SelectionEditor` 的 select/color）。
- 素材库搜索框、`CmsFilterBar` 筛选 chips、「刷新项目 / 加载更多」文本按钮。
- `PriceInput` 保持原生 input（与画布密集面板共用，改成 shadcn 会连带改动画布 UI）。

## 关键文件
- `src/features/interior/components/CustomFurnitureDialog.tsx`
- `src/features/interior/components/ProjectManager.tsx`
- `src/features/interior/components/AccountFurnitureDialog.tsx`
- `src/features/interior/components/AccountCostDialog.tsx`
- `src/features/interior/components/AuthDialog.tsx`
- `src/features/interior/components/ProjectDialog.tsx`
- `src/features/interior/data/palette.ts`（新增）、`src/features/interior/components/SelectionEditor.tsx`（仅换色板来源）
- `src/index.css`
- 复用现成组件：`@/components/ui/{select,input,label,checkbox,tabs,popover,button,dialog,alert-dialog}`

## Implementation checklist
- [ ] `CustomFurnitureDialog.tsx`：分类、参考模型改为 shadcn `Select`，`onValueChange` 仍写入 `category` / `type`。
- [ ] `CustomFurnitureDialog.tsx`：名称、宽深高、价格改为 `Input` + `Label htmlFor`，校验与 `type="number"`、`maxLength`、`required` 保持不变。
- [ ] `CustomFurnitureDialog.tsx`：账号库勾选改为 `Checkbox` + `Label`，`accountOnly` 分支不渲染该勾选。
- [ ] `CustomFurnitureDialog.tsx`：`.project-tabs` 两个按钮改为 `Tabs` 结构，切到账号库仍触发 `catalog.load()`；`accountOnly` 时不渲染 Tabs。
- [ ] `CustomFurnitureDialog.tsx`：模型颜色改为 `Popover` + 色块色板 + 自定义取色，默认色 `#b7c4b0` 与 `setColor` 行为不变。
- [ ] `CustomFurnitureDialog.tsx`：`locked = ai.busy||saving||!!pending` 显式传给 Select/Input/Checkbox，`fieldset` 仍保留。
- [ ] 新增 `src/features/interior/data/palette.ts` 导出 `FURNITURE_COLORS`，`SelectionEditor.tsx` 改为引用它并删除本地 `colors`。
- [ ] `ProjectManager.tsx`：弹窗内项目名称 `Input`、户型模板 `Select`（blank/reference 两项），提交逻辑不变。
- [ ] `ProjectManager.tsx`：卡片加 `cms-card-open` 遮罩按钮触发 `projects.open(row)` + `opened()`，删除「打开设计」按钮与「本机」标签。
- [ ] `ProjectManager.tsx`：重命名/复制（本机为上传到云端）/删除改为 `Button variant="ghost" size="icon"`，`aria-label` 与调用链保留。
- [ ] `AccountFurnitureDialog.tsx`、`AccountCostDialog.tsx`：主/危险按钮改为 `Button` 并带 `cms-detail-action`。
- [ ] `AuthDialog.tsx`：邮箱/密码改为 `Input`（无边框覆盖），校验属性保留。
- [ ] `ProjectDialog.tsx`：创建项目名与重命名输入改为 `Input`。
- [ ] `src/index.css`：收窄 `.custom-furniture-fields input/select`；删 `.cms-form input/select`；`.project-tabs` active 选择器改用 `[data-state='active']`；新增 `.cms-field`、`.furniture-color-*`、`.cms-card-open` 与 `.cms-card` hover 规则；删除 `.cms-card-tag`、`.cms-card-actions>button:not(:first-child)`；移动端媒体查询改指 `.cms-detail-action`。

## Verification checklist
- [ ] `pnpm lint` 通过（无 unused import，如 `Plus` / `Button` 仍在用）。
- [ ] `pnpm exec tsc --noEmit` 通过。
- [ ] `pnpm test` 通过（`src/features/interior` 下模型层测试不受 UI 改动影响，用于确认无回归）。
- [ ] `pnpm run build` 通过。
- [ ] 正向：预览首页 → 素材库「新建家具 / 账号库」→ 弹窗内分类、参考模型可展开 shadcn 浮层并选中；宽深高、价格可输入；色板可选色；两个 Tab 可切换且账号库列表能加载。
- [ ] 负向/边界：名称为空或尺寸超范围时提交仍报「请填写名称、有效尺寸及非负单价」，且不触发 AI 生成；生成中（`ai.busy`）时下拉/输入/勾选为禁用态；`accountOnly` 模式无 Tabs 与账号库勾选。
- [ ] 卡片：点击卡片空白处或标题进入项目；点击铅笔/复制/删除图标只触发对应弹窗，不会顺带打开项目；「本机」标签与「打开设计」按钮不再出现。
- [ ] 视觉：`website_screenshot` 打开运行中的应用根路径确认无布局破损（若预览环境已登录，可直接看到项目管理卡片网格；弹窗内部需在预览中点击打开确认，截图工具无法打开弹窗，这一点以代码审查 + 上述手工操作为准）。
