# 编辑器悬浮提示（Tooltip）全面排查与补齐方案

## Context

用户反馈：编辑器里很多按钮和操作「不知道是干啥的」，希望全部操作项都有 hover 悬浮说明。范围确认为**本项目应用内**的编辑器（不是 Enter 平台自带界面），且**所有按钮都补**，包括已经有文字标签的按钮。

现状排查结果：

| 区域 | 现状 | 问题 |
| --- | --- | --- |
| 顶部工具栏 `ToolButton`（选择/绘墙/门/窗/撤销/重做/重置/清空） | 已有 Radix Tooltip（`tool-tooltip`），带快捷键 kbd | 已达标，保持 |
| 视图切换 2D/3D、更多、图层、文件 | 无 Tooltip | 图标语义不明确 |
| 画布浮层（缩放 −/＋/适应窗口、侧栏开关、日照/夜间、±90 秒） | 只有 `aria-label` 或 `title` | 鼠标悬停看不到说明 |
| **选中对象编辑工具条 `SelectionEditor`（即用户说的「visual editor」）** | 9 个图标按钮只有 `aria-label`，无任何可视提示；颜色圆点用 `title`，与视觉体系不一致 | 最严重，`title` 原生提示延迟长、样式不可控、触屏无效 |
| 属性面板 / 成本面板 / 项目对话框中文案按钮（置顶、置底、更多、承重、开向等） | 无说明 | 歧义按钮（置顶/置底、承重、更多）需要一句解释 |
| 弹窗内图标按钮（项目管理刷新、重命名/复制/删除、成本删除、返回、清空搜索） | 部分 `title` | 风格不统一 |

同时发现两处需要一并改掉的隐患：

1. `SelectionEditor` 的按钮样式依赖直接子代选择器 `.visual-selection-editor > button`，加 Tooltip 包装层会**丢失 flex 对齐与 hover 圆角**，必须同步改 CSS。
2. `EditorSelect`（门开向、材质等下拉）与 `DimensionSettings` 的 `Switch` 缺少 `title`/`aria-label` 之外的说明，且检查到 `EditorSelect` 的 `Label` 已关联，开关有 `aria-label`，可用 Tooltip 补一句用途。

## 目标

1. 抽出统一的可复用悬浮提示组件，全项目只用一套视觉与行为（复用已有 `.tool-tooltip` 样式与 `App.tsx` 里的 `TooltipProvider`）。
2. 让**编辑器的每一个可点控件**（图标按钮、文字按钮、画布浮层按钮、菜单入口、开关/下拉）在鼠标悬停、键盘聚焦、触屏长按时都能看到「做什么 + 快捷键（若有）」。
3. 用 `aria-label` 作为无悬停能力（触屏、读屏）时的兜底，保证每个按钮都有可访问名称。

## 方案

### 1. 新增统一组件 `src/components/ui/editor-tooltip.tsx`

- 导出 `EditorTooltip`（通用组合式：包住 `Popover`/`DropdownMenu` 触发器或自定义子元素，`asChild` 到底层元素，不额外产生 DOM 尺寸变化）与 `TooltipIconButton`（图标按钮快捷封装）。
- Props：`label`（必填，动作名）、`description`（可选，一句解释）、`shortcut`（可选，渲染为 `<kbd>`）、`side`（默认 `bottom`）、`sideOffset`（默认 8）。
- `EditorTooltip` 内部统一输出 `className="tool-tooltip"` 与 `<span>{label}</span>{shortcut && <kbd>…</kbd>}{description && <small className="tool-tooltip-note">…</small>}`。
- `TooltipIconButton` 渲染 `<span className="tool-button-wrap">` + `<button aria-label={label}>`，并补齐 `disabled` 时 `pointer-events: none` 的既有规则（`.tool-button-wrap > button:disabled` 已存在，直接复用）。
- 保留 `disabled` 按钮仍可悬停看到说明（Radix Tooltip 在 disabled 按钮上不触发，用外层 `span` 承载触发器解决）。
- 组件内不做 `title` 输出，避免与原生提示双份弹窗。

### 2. `src/features/interior/components/SelectionEditor.tsx`（重点）

把 9 个图标按钮 + 颜色区 + 各 Popover 触发器统一接入 `EditorTooltip`，文案如下（图标按钮同时保留/补 `aria-label` 作为兜底）：

| 控件 | label | description | shortcut |
| --- | --- | --- | --- |
| 拖动把手 | 拖动工具条 | 也可用方向键移动 | — |
| 尺寸触发器 | 调整尺寸 | 修改宽 / 深 / 高度与沿墙位置 | — |
| 旋转 | 旋转 90° | 按住 Shift 反向旋转 | R |
| 复制 | 复制对象 | 原位偏移复制一份 | Ctrl D |
| 删除 | 删除对象 | 承重墙体与已保护洞口不可删除 | Delete |
| 承重（墙体） | 承重属性 | 查看或标记墙体是否承重 | — |
| 详细属性 | 详细属性 | 在右侧面板打开完整参数 | — |
| 取消选择 | 取消选择 | 关闭工具条 | Esc |
| 材质（房间） / 开向（门） / 单价 | 材质 / 门开向 / 调整单价 | 说明弹窗内容 | — |
| 自定义颜色 | 自定义颜色 | 打开取色器 | — |
| 颜色圆点组 | 常用颜色 | 点击替换当前对象颜色 | — |

颜色圆点（8 个）只在**组容器**加一条 Tooltip，避免密集圆形按钮上叠加 8 个气泡造成视觉噪音，同时补 `aria-label`。

### 3. `src/index.css` 同步适配

- `.visual-selection-editor > button` → 追加 `.visual-selection-editor > .tool-button-wrap > button`，使包装后的按钮保持 `display:flex; gap:5px; padding:7px; border-radius:5px`。
- 追加 `.visual-selection-editor > .tool-button-wrap { display:inline-flex; }`。
- 追加 `.tool-tooltip-note { font-size: 9px; color: hsl(var(--muted-foreground)); }` 与 `.tool-tooltip:has(.tool-tooltip-note)` 的纵向排布，保证「动作名 + 解释」两行时排版正确。
- 检查 `.tool-tooltip` 的 `font-size:10px` 与移动端媒体查询，确保窄屏不撑破。

### 4. 其余编辑器控件补齐（不改逻辑，只加提示）

- `Workbench.tsx`：`2D 平面`（平面布置图，T）、`3D 场景`（立体预览，T）、`更多`（测量、清除测量线、拆改非承重墙）、`图层`（显示/隐藏尺寸、房间名、家具、网格、承重高亮、贴墙吸附）、`文件`（下载图片、工程图、JSON、导入、重置）、`操作帮助`、`全屏`、侧栏开关（家具库 / 属性面板）、缩放 −/＋/适应窗口、`关闭`（mode-hint 的 ×）、夜间/日照按钮与滑杆。已有 `title` 的改为统一 Tooltip 并移除 `title`。
- `WorkbenchHeader.tsx`：返回项目管理、切换项目、下载设计图下拉、我的账号。
- `PropertyPanel.tsx`：`置顶`/`置底`（调整为最上层/最下层显示）、`复制`、`删除`、`返回方案总览`、房间家具行、`户型设置` 内的开关与输入说明。
- `CostPanel.tsx` / `MaterialProcurementEditor.tsx` / `PriceInput.tsx`：返回属性、恢复账号默认、删除费用、收起/展开采购规格、应用采购规格、添加人工、应用。
- `ProjectDialog.tsx` / `ProjectManager.tsx`：新建项目、模板选择、重命名/复制/删除项目、刷新、加载更多、保存名称、取消。
- `AccountCostManager.tsx` / `AccountFurnitureLibrary.tsx`：清空搜索、查看全部、加载更多、重试保存。
- `Library.tsx`：搜索框旁补提示（`/` 聚焦搜索）、新建家具 / 账号库。
- `ColorPickerField.tsx`：与 `SelectionEditor` 一致，圆点组只加组级 Tooltip。

### 5. 不做的部分

- 不改任何交互逻辑、数据流、后端调用。
- 不给纯信息类元素（统计数字、脚注、房间面积行）加 Tooltip。
- Enter 平台自身界面（截图里 Preview 旁的小图标、项目名称下拉）不属于本项目代码，不在此方案内。

## 关键文件

- 新增：`src/components/ui/editor-tooltip.tsx`
- 修改：`src/features/interior/components/SelectionEditor.tsx`（重点，9 个图标按钮 + 颜色区）
- 修改：`src/features/interior/components/Workbench.tsx`、`WorkbenchHeader.tsx`、`PropertyPanel.tsx`、`CostPanel.tsx`、`MaterialProcurementEditor.tsx`、`PriceInput.tsx`、`ProjectDialog.tsx`、`ProjectManager.tsx`、`Library.tsx`、`ColorPickerField.tsx`、`AccountCostManager.tsx`、`AccountFurnitureLibrary.tsx`
- 修改：`src/index.css`（`.visual-selection-editor` 子代选择器 + `.tool-tooltip-note`）
- 复用：`src/components/ui/tooltip.tsx`、`App.tsx` 的 `TooltipProvider`、现有 `.tool-tooltip` / `.tool-button-wrap` / `.tool-button` 样式

## Implementation checklist

- [x] 新建 `src/components/ui/editor-tooltip.tsx`，导出 `EditorTooltip`，支持 label / description / shortcut / side / disabled；用 `asChild` 直接挂到已有按钮上，不新增包裹层
- [x] `disabled` 时内部加一层 `.editor-tooltip-trigger`，使禁用按钮也能悬停查看说明；`.editor-tooltip-trigger > button:disabled { pointer-events: none }` 保证触发器接收指针
- [x] `SelectionEditor` 的全部图标按钮（拖动、旋转、复制、删除、承重、分割墙段、详细属性、取消选择、尺寸、单价）接入 Tooltip，原生 `title` 已移除避免双份提示
- [x] `SelectionEditor` 的 8 个颜色圆点：组容器有一条 Tooltip，圆点保留 `aria-label`（同时移除圆点的 `title`）
- [x] `src/index.css` 扩展 `.visual-selection-editor … .editor-tooltip-trigger > button` 规则，包装后按钮保持原有 flex/gap/padding/hover 圆角
- [x] `src/index.css` 增加 `.tool-tooltip-row` / `.tool-tooltip-note` 排版规则，两行提示（动作名 + 解释）不溢出（`max-width: 240px`）
- [x] `Workbench.tsx` 工具栏 2D/3D 切换、更多、图层、文件、帮助、全屏、侧栏开关、缩放、适应窗口、退出工具、夜间/日照、完成绘墙/测量均有 Tooltip，原 `title` 已替换
- [x] `WorkbenchHeader.tsx` 的返回、切换项目、下载设计图、账号按钮均有 Tooltip
- [x] `PropertyPanel.tsx` 的 `置顶`/`置底`/`复制`/`删除`/`返回方案总览`/`本间成本`/`分割墙段`/`删除隔墙`/`删除开口`/分页标签有 Tooltip，`置顶`/`置底` 说明写明是显示层级
- [x] `CostPanel.tsx` 拆分出的 `CostHero.tsx`、`CostCategoryList.tsx`、`MaterialProcurementEditor.tsx`、`PriceInput.tsx`、`CostRowEditor.tsx`、`LaborEditor.tsx`、`RoomCostDetail.tsx`、`RoomCostList.tsx`、`PanelModeTabs.tsx` 的按钮有 Tooltip
- [x] `ProjectManager.tsx`、`AccountCostManager.tsx`、`AccountFurnitureLibrary.tsx`、`AccountCMS.tsx`、`AuthDialog.tsx`、`Library.tsx`、`ColorPickerField.tsx`、`CmsFilterBar.tsx` 的按钮有 Tooltip
- [x] `ProjectDialog.tsx` 未被任何页面引用（已确认无 import），未改动
- [x] `grep -n "title=" src/features/interior` 只剩 `status-tip` 与保存状态两个非交互文本的截断提示

## Verification checklist

- [x] `pnpm test`：54 个文件 / 338 个用例全部通过
- [x] `pnpm lint`：0 error，仅剩 PlanCanvas 既有的 `useEffect` 依赖 warning
- [x] `pnpm exec tsc --noEmit`：无类型错误
- [x] `pnpm run build`：构建成功
- [x] 新增 `src/features/interior/components/editorTooltip.test.tsx`（vitest 范围只在 `src/features/interior`，故未放在 `src/components/ui`）：正常态不新增包裹层且不输出 `title`；禁用态加触发器；脱离 `TooltipProvider` 独立渲染不报错
- [x] `SelectionEditor.test.tsx` 新增断言：工具条内每个 `button` / shadcn `Button` 都位于 `EditorTooltip` 内且带 `aria-label`
- [ ] 手动验证：选中家具与墙体两种状态下 hover 每个按钮均出现气泡（需在预览里逐个悬停确认）
- [ ] 手动验证：悬停禁用态的撤销 / 清空家具 / 3D 场景按钮仍显示说明
- [ ] 手动验证：窄屏（≤600px）与抽屉模式下 Tooltip 不被裁切
- [x] 视觉回归：`website_screenshot` 桌面宽度下工具栏与面板布局与改动前一致，无位移（改动只在悬停时出现气泡）

