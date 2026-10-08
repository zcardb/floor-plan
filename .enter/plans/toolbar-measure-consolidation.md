# 工具栏精简：「测量」控件收纳 + 心理学法则梳理

## Context

用户给出的两张标注图（`image (20).png` / `image (21).png`）指向不同位置，澄清后的结论是：

1. **把整个「测量」相关控件收进一个下拉菜单**，保持工具栏精简 —— 目前「测量」是工具栏左侧编辑组的独立按钮（`Workbench.tsx` 第 537-544 行），而「清除测量线」被放在**右侧属性面板底部**（第 977-989 行）。同一功能的两个控件被拆到界面两端，用户画完测量线后要横跨整个画布去找清除入口（图 20 的红色长箭头正是这个绕行路径）。
2. **再按心理学法则梳理工具栏**（用户提供的参考：Growth Design 案例站与 growth.design/psychology）。落到本项目的具体法则：Hick 定律、渐进披露、邻近/分块法则、反馈闭环、可识别性（signifier）、Von Restorff、Fitts 定律。

范围限定：只改工作台顶部工具栏 + 属性面板底栏 + 相关文案/CSS。**不动**画布绘制逻辑、测量数据模型、3D 场景、云端与 CMS。

## 推荐实现

### 1. 「测量」收纳为单个下拉菜单（渐进披露 + 反馈闭环）

`Workbench.tsx` 第 537-544 行的独立「测量 `ToolButton`」替换为一个 `DropdownMenu`（复用文件内已导入的 `DropdownMenu*` 组件，与现有「结构」「图层」「文件」三个菜单同构）：

- 触发器：沿用 `<button className="tool-button">` 外观（与「结构」一致，保持**相似性法则**下的同族识别）。内容为 `Ruler` 图标 + `测量` 文字 + `ChevronDown`；当 `tool === "measure"` 时加 `active` 类（沿用现有 `.tool-button.active` 令牌样式，给出**状态反馈**）；当 `d.measures.length > 0` 时显示计数徽标。
- 菜单项 1：`测量距离` —— 点击 `setTool("measure")`；右侧在 `M` 快捷键 `<kbd>` 与 `Check` 完成标记之间切换（进行中显示 ✓），键盘 `M` 直接进入测量的快路径保持不变（第 339 行不动）。
- 分隔线 + 菜单项 2：`清除测量线` —— 调用现有 `clearMeasures`（第 411 行），`disabled={!d.measures.length}`，有测量线时右侧显示数量。带 `danger-item` 类做破坏性着色（**Von Restorff**）。
- 该菜单仍只在 `view === "2d"` 分支内渲染（测量线只在 2D 画布绘制，切换回 2D 即可看到并清除，不构成死路）。

### 2. 删除属性面板底栏（消除重复入口）

`Workbench.tsx` 第 977-989 行整块 `<div className="panel-footer">…</div>` 删除，`index.css` 中随之失去引用的 `.panel-footer` / `.panel-action` / `.panel-action:hover` / `.panel-action .count`（第 404-432 行）一并删除（已确认仅此一处引用）。

### 3. 工具栏分组重排（Hick 定律 + 分块/邻近法则）

- 删除 `Workbench.tsx` 第 623-635 行的 `wide-only` 破坏性分组（`重置方案` / `清空家具`）—— 这 2 个顶层选项与「文件」菜单内的同名项完全重复，属于 **Hick 定律** 下可直接削减的决策成本。
- 让「文件」菜单里的 `重置当前方案`（第 722 行）与 `清空家具布置`（第 726 行）**始终可见**（移除 `compact-only`，含其上的分隔线第 721 行），保证渐进披露后仍可发现，并加 `danger-item` 破坏性着色（**signifier**）。
- `结构` 菜单里的「拆改非承重墙」（第 566 行）同样加 `danger-item`，与其它破坏性操作保持一致的视觉信号。
- 删除后 `compact-only` / `wide-only` 两个 CSS 工具类若无其它引用，一并从 `index.css` 移除（**必须先 grep 确认**）。
- 最终顶层顺序（2D）：`[2D 平面 | 3D 场景]` ─ `[选择 · 绘墙* · 测量▾ · 结构▾]` ─ `[撤销 · 重做]` ─ `[图层▾ · 文件▾ · 帮助 · 全屏]`，每组语义单一、以分隔线分块。顶层可点目标由 14 个降至 12 个（非空白模板 11 个）。

### 4. CSS（`src/index.css`，全部走语义令牌，不写死颜色）

- 新增 `.tool-button .tool-count`：测量数量小徽标（参考现有 `.panel-action .count` 的字号与 `tabular-nums`，背景/文字用 `--primary` / `--primary-foreground`）。
- 新增 `.menu-kbd`（菜单内快捷键）与 `.menu-mark`（进行中 ✓，`margin-left:auto`，颜色 `hsl(var(--primary))`）。
- 新增 `.danger-item`：`color: hsl(var(--destructive))`，并覆盖 shadcn 菜单项的 focus 态。
- 移动端（`max-width: 600px`）沿用现有规则：`.tool-group .tool-button > span` 与尾部 `svg` 已隐藏，触发器自动降级为纯 `Ruler` 图标，无需新增媒体查询；触发器补 `aria-label="测量"` 保证可访问名。

### 5. 文案同步

- `Workbench.tsx` 第 418 行 `tip`：`测量线可在右侧面板底部清除` → `Esc 结束测量 · 测量线可在顶部「测量」菜单中清除`。
- 第 1074 行帮助弹窗：`测量线可在右侧面板底部一键清除` → `测量线可在顶部「测量」菜单中一键清除`。

## 关键文件

- `src/features/interior/components/Workbench.tsx`（工具栏、属性面板底栏、`tip`、帮助弹窗）
- `src/index.css`（新增徽标/菜单/破坏性样式，删除废弃的 `.panel-footer`、`.panel-action`、`.wide-only`、`.compact-only`）

## Implementation checklist

- [ ] `Workbench.tsx` 2D 编辑组中，`测量` 独立按钮替换为含「测量距离」与「清除测量线」两项的下拉菜单
- [ ] `测量` 触发器在 `tool === "measure"` 时带 `active` 类，`d.measures.length > 0` 时显示计数徽标
- [ ] 菜单内「测量距离」触发 `setTool("measure")`，`M` 快捷键（第 339 行）行为保持不变
- [ ] 菜单内「清除测量线」调用 `clearMeasures`，无测量线时 `disabled` 且显示数量
- [ ] `Workbench.tsx` 的 `<div className="panel-footer">` 及其内部按钮整块删除
- [ ] 工具栏 `wide-only` 破坏性分组（`重置方案` / `清空家具`）从 `Workbench.tsx` 删除
- [ ] 「文件」菜单中 `重置当前方案` 与 `清空家具布置` 去掉 `compact-only` 并加 `danger-item`，分隔线同步去掉 `compact-only`
- [ ] 「结构」菜单中 `拆改非承重墙` 加 `danger-item`
- [ ] `index.css` 新增 `.tool-count` / `.menu-kbd` / `.menu-mark` / `.danger-item` 四条规则，全部使用语义令牌
- [ ] `index.css` 删除 `.panel-footer`、`.panel-action`（含 hover 与 `.count`）规则；grep 确认无引用后删除 `.compact-only`、`.wide-only` 规则
- [ ] `tip` 与帮助弹窗文案改为指向顶部「测量」菜单
- [ ] 移动端窄屏下触发器降级为图标且工具栏不溢出（沿用现有媒体查询，必要时补 `aria-label`）

## Verification checklist

- [ ] `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm run build` 全部通过
- [ ] 正向：点开「测量」菜单 → 「测量距离」→ 状态栏显示「测量模式」且画布出现模式提示条 → 画一段测量 → 重新打开菜单看到计数徽标与可用的「清除测量线」→ 点击后测量线清空且菜单自动关闭
- [ ] 负向/默认态：无测量线时「清除测量线」为禁用态；未登录（游客）状态下「文件」菜单中仍能看到「重置当前方案」「清空家具布置」并呈破坏性配色
- [ ] 边界：`M` 键仍直接进入测量、`Esc` 仍退出测量；`撤销` 可恢复被清除的测量线；3D 视图下工具栏无「测量」菜单且布局不错位
- [ ] 视觉证据：`website_screenshot` 抓取工作台首页 `desktop_1280` 与 `mobile_390`，确认工具栏分块清晰、菜单项对齐、窄屏不溢出（若窄屏溢出则回改 CSS 后重测）
