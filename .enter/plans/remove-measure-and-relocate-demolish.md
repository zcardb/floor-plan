# 彻底移除「测量距离」，并把「拆改非承重墙」迁到墙的编辑菜单

## Context（为什么改）

2D 工具栏的「更多」菜单里目前有三项：`测量距离(M)`、`清除测量线`、`拆改非承重墙(X)`。用户反馈：

1. **「测量距离」整体不需要** → 彻底删除：工具、M 快捷键、测量线数据字段、画布绘制、悬停测距提示、工程图 `MEASURES` 图层。
2. **「拆改非承重墙」不再放在顶部** → 改为在 Visual Editor 里选中一面墙后，在墙的编辑菜单里操作，并新增「**删除当前墙**」。两处墙的编辑菜单（浮动工具条 + 右侧属性面板）共用同一个 `WallOptionsMenu`，改一次两处同时生效。

这是**功能删减 + 入口迁移**，不是新增能力：拆除标注（`demolished`）、拆改造价、工程图 `DEMOLISHED` 图层等既有语义全部保留。

## 变更总览

- **A. 彻底移除测量**：数据模型、校验、模板、画布渲染、快捷键、提示文案、导出图层、样式、测试。
- **B. 顶部工具栏去掉测量与拆改入口**：测量项与拆改项都要消失；「更多」菜单仅保留窄屏才需要的破坏性操作入口（见 B2，不能直接整块删掉）。
- **C. 墙编辑菜单新增「删除当前墙」**，并把原「拆改非承重墙」的标记/撤销拆除能力迁到同一菜单。

## A. 彻底移除测量

| 文件 | 改动 |
| --- | --- |
| `src/features/interior/model/types.ts` | 删 `Measure` 接口、`Design.measures`、`Tool` 联合里的 `"measure"` |
| `src/features/interior/data/templates.ts` | `referenceDesign()`(约 285 行) 与 `blankDesign()`(约 311 行) 去掉 `measures: []` |
| `src/features/interior/model/validation.ts` | 删旧版(version≠2) JSON 的 `measures` 转换(25/34 行)、必检数组列表里的 `"measures"`(55 行)、`for (const m of v.measures)` id 校验循环(194-197 行) |
| `src/features/interior/model/wallSplit.ts` | `used` id 集合去掉 `...design.measures`(32 行) |
| `src/features/interior/model/drawingDocument.ts` | `DrawingLayer` 去掉 `'MEASURES'`；`DRAWING_LAYERS`、`DRAWING_LAYER_NAMES` 同步；删掉 113-117 行由 `d.measures` 生成尺寸的循环 |
| `src/features/interior/model/drawingStyle.ts` | `LAYER_STYLES` 去掉 `MEASURES`(13 行) |
| `src/features/interior/model/dxfExport.ts` | 39 行图层数组去掉 `'MEASURES'` |
| `src/features/interior/components/PlanCanvas.tsx` | 删 `measurement = useSegmentDrawing(tool === 'measure', …)`(120-123) 与 `drawing` 二选一别名(124)，`tool===` 判断(417、536、618)统一按绘墙处理；删 `design.measures.map(...)`(792-794)与测量草稿块(797-802)。**保留 `MeasureLine`**——绘墙草稿预览(795 行)仍在用 |
| `src/features/interior/components/WallHoverOverlay.tsx` | 去掉 `variant?: 'wall' \| 'measure'` 与「距起端/距末端」两行(27-28)，只保留绘墙的「距近端 … 米 / 点击连接」 |
| `src/features/interior/components/Workbench.tsx` | 删 M 快捷键(413)、`clearMeasures`(494-497)、measure 提示文案(502-503)、状态栏「测量模式」分支(1078-1079)与「完成测量」按钮分支(1087) |
| `src/features/interior/components/PropertyPanel.tsx` | 删「操作说明」里的 `M / 测量距离` 一行(608-611) |
| `src/index.css` | `.tool-wall, .tool-measure`(898-901) 只留 `.tool-wall`；`.menu-count`(3516) 若无其他调用一并删除 |

`useSegmentDrawing.ts` / `useWallDrawing.ts` **保留**：`useWallDrawing` 依赖 `useSegmentDrawing`，绘墙功能仍需要。

## B. 顶部工具栏去掉测量与拆改入口

1. **「更多」菜单里的三项全部移除**：测量、清除测量线、拆改非承重墙。
2. **保留「更多」按钮，但收敛为窄屏专用入口**：当前该菜单还挂着 `compact-only` 的「重置方案 / 清空家具」(640-648 行)，而 `.danger-actions` 在 ≤600px 被隐藏(`index.css` 3444-3449)。所以：
   - `DropdownMenuContent` 只留 `<DropdownMenuSeparator className="compact-only" />` + 这两项；
   - 触发按钮 `className` 改为 `"tool-button compact-only"`（去掉 measure/demolish 的 `active` 计算），窄屏才出现，宽屏不会出现空菜单、也不会与工具栏的破坏性操作形成双入口。
3. **`Tool` 联合去掉 `"demolish"`**：删 `PlanCanvas` 的 `wallToggle`(287-302) 与 `tool === "demolish"` 分支(413-416)、`Workbench` 的 X 快捷键(414)、状态栏「结构编辑」兜底分支(1080)、`index.css` 的 `.tool-demolish .plan-wall:hover`(895-897)。
4. **保留不动**：`Design.demolished` 数据、`canDemolishWall`、红色拆除标注渲染(`--plan-demolished`)、拆改造价、`DEMOLISHED` 导出图层、页脚「拆改须专业确认」等文案。

## C. 墙编辑菜单：新增「删除当前墙」+ 迁移拆除标注

新增 `src/features/interior/model/wallRemoval.ts`（避免组件里重复逻辑，`wallPolicy` 不能反向 import `geometry`，故独立成模块）：

```ts
/** 真实删除自绘隔墙：过滤墙与墙上门窗后重建房间，可撤销。 */
export function removeWall(design: Design, wallId: string): Design   // 仅 canEditWall 通过，否则抛「此墙体不可删除」
/** 非承重墙的拆除标注开关（原 PlanCanvas.wallToggle 的语义）。 */
export function toggleWallDemolition(design: Design, wallId: string): Design  // 仅 canDemolishWall 通过，否则抛「承重墙和建筑外墙不可拆除」
```

两者内部都复用 `geometry.rebuildRooms`（与原 `wallToggle`、`Workbench.remove()` 墙体分支完全一致）。

改造 `src/features/interior/components/WallOptionsMenu.tsx`，新增区块「墙体删除」：

| 菜单项 | 出现/可用条件 | 点击行为 |
| --- | --- | --- |
| 删除当前墙 | 始终显示；`canEditWall(design, wall)` 才可用 | 新回调 `removeWall(wall.id)` |
| 标记拆除当前墙 / 撤销拆除 | `canDemolishWall(wall)` 才显示 | `change(d => toggleWallDemolition(d, wall.id))`，成功 `notify.success` |

不可用原因（`<small>` 副标题，沿用现有 `wall-options-copy` 写法）：
- 已拆除的墙点「删除当前墙」→「请先撤销拆除」；
- 承重墙（`isBearingWall`）→「承重墙不可删除」；
- 参考户型/锁定结构 →「参考户型原始墙体不可删除，可标记拆除」；
- 承重墙与建筑外墙在拆除项上 →「承重墙与建筑外墙不可拆除」。

回调贯通（沿用现有 `splitWall`/`mergeWall` 的写法，不新建状态管理）：

1. `Workbench.tsx`：把 `remove()`(349 行起)的墙体分支抽成 `removeWall = useCallback((id: string) => …)`（`canEditWall` 校验 + `removeWall(d,id)` + `setSelection(null)` + 原有 notify 文案），`remove()` 的 `s.kind === 'wall'` 分支改为调用它；在两处渲染处新增 `removeWall={view === '2d' ? removeWall : undefined}`（991-992 行 `PropertyPanel`、1047-1048 行 `SelectionEditor`，与现有 `splitWall`/`mergeWall` 并列）。
2. `PropertyPanel.tsx`、`SelectionEditor.tsx`：`Props` 增加 `removeWall?: (wallId: string) => void`，透传给 `WallOptionsMenu`（`SelectionEditor` 的垃圾桶「删除对象」按钮保持不变，仍走 `p.remove`）。

## 待更新的测试

- `src/features/interior/components/PlanCanvas.test.tsx`：去掉 `hooks.measurement` 与 `vi.mock('./useSegmentDrawing')`(24 行)、整个「PlanCanvas 测量完成事件链」describe(70-112)、以及 58 行 `tool` 列表里的 `'demolish'`。
- `src/features/interior/components/Workbench.test.tsx`：删 159-179（更多菜单切换测量/拆改、清除测量线）；180-209 的快捷键测试改为只保留 `v`/`Escape`；156 行不再期望 `aria-label="更多"` 在宽屏出现。
- `src/features/interior/components/useSegmentDrawing.test.ts`：只保留绘墙路径（去掉 `measures` 分支与 45-54 的测量用例）。
- `src/features/interior/components/WallHoverOverlay.test.tsx`：删 14-20 的 measure 变体用例。
- `src/features/interior/model/toolCompletion.test.ts`：`supportsPointerCompletion` 仅 wall 为真，`'demolish'`/`'measure'` 归入 false 组。
- `src/features/interior/model/drawingExport.test.ts`：`fixture()` 去掉 `d.measures.push(...)`(28 行)；75-78 行改为断言普通 `DIMENSIONS` 文本；151-152 行改为「关闭 dims 后 `document.dimensions` 为空」。
- `src/features/interior/model/dimensionHistory.test.ts`(63)、`dimensionWallEdit.test.ts`(30)、`geometry.test.ts`(122)：去掉 `measures` 断言/夹具字段。
- 新增 `src/features/interior/model/wallRemoval.test.ts`：`removeWall` 对自绘隔墙成功、对承重墙/外围墙抛错；`toggleWallDemolition` 标记与撤销、承重墙抛错。
- `src/features/interior/components/wallSplitEntries.test.tsx`：补一条「承重墙时两个删除项禁用；空白户型隔墙可点『删除当前墙』；参考户型隔墙可点『标记拆除当前墙』」的断言（沿用该文件既有的 `nodes/text` 断言方式）。

## Implementation checklist

- [x] `types.ts` 删除 `Measure`、`Design.measures`、`Tool` 中的 `"measure"` 与 `"demolish"`
- [x] `templates.ts` 两个模板去掉 `measures: []`
- [x] `validation.ts` 去掉 measures 的旧版转换、必检数组项、id 校验循环
- [x] `wallSplit.ts` 的 used id 集合去掉 `design.measures`
- [x] `drawingDocument.ts` / `drawingStyle.ts` / `dxfExport.ts` 去掉 `MEASURES` 图层与样式
- [x] `PlanCanvas.tsx` 删除测量 hook/别名/渲染块/草稿块与 demolish 分支，保留 `MeasureLine` 供绘墙草稿使用
- [x] `WallHoverOverlay.tsx` 去掉 `variant` 与两端距离文本
- [x] `Workbench.tsx` 删 M/X 快捷键、`clearMeasures`、测量/拆改提示与状态分支，「更多」菜单收敛为 compact-only 的「重置方案/清空家具」且触发按钮加 `compact-only`
- [x] `Workbench.tsx` 清理不再使用的 icon import（`Eraser`、`rebuildRooms`），确认 `Check`/`ChevronDown`/`Ruler`/`Settings2`/`Trash2` 仍被视图菜单与破坏性操作使用
- [x] `PropertyPanel.tsx` 删「操作说明」的 `M / 测量距离` 行
- [x] `index.css` 删除 `.tool-measure`、`.tool-demolish`、无用的 `.menu-kbd`/`.menu-mark`/`.menu-count`
- [x] 新增 `model/wallRemoval.ts`（`removeWall` + `toggleWallDemolition`，复用 `rebuildRooms`/`canEditWall`/`canDemolishWall`）
- [x] `WallOptionsMenu.tsx` 新增「墙体删除」区块：`删除当前墙` 与 `标记拆除当前墙 / 撤销拆除`，含禁用与原因副标题
- [x] `Workbench.tsx` 抽出 `removeWall` 回调并复用进 `remove()` 的墙体分支，透传 `removeWall` 给 `PropertyPanel` 与 `SelectionEditor`
- [x] `PropertyPanel.tsx` / `SelectionEditor.tsx` 增加 `removeWall` 属性并透传给 `WallOptionsMenu`（垃圾桶按钮行为不变）
- [x] 按上文逐条更新既有测试，并新增 `wallRemoval.test.ts` 与 `wallSplitEntries.test.tsx` 的新断言
- [x] 附带修正：删除已标记拆除的隔墙时同步清理 `demolished` 里的失效 id（否则再次导入会触发校验失败）

## Verification checklist

- [x] `pnpm lint` 通过（仅余 `PlanCanvas.tsx:211` 既有 exhaustive-deps 警告）
- [x] `pnpm test` 全部通过：`59 passed (59)` 个测试文件，含新增 `wallRemoval.test.ts` 与 `wallSplitEntries.test.tsx` 的删除入口用例
- [x] `pnpm run build` 通过
- [x] 正向：空白户型自绘隔墙点「删除当前墙」→ 复用 `removeWall` 删除墙及其门窗并重建房间；`wallRemoval.test.ts` 断言墙/门窗移除、房间重建、结果再次通过 `validateDesign`
- [x] 正向：非承重墙「标记拆除当前墙 / 撤销拆除当前墙」可来回切换；参考户型隔墙标记后 `rooms` 保持原引用（不重建）
- [x] 负向/默认：承重墙与外围墙两个入口都禁用并显示原因；M / X 已不再切换工具（`Workbench.test.tsx` 断言按 M、X 后仍为 `select`）
- [x] 边界：`?` 已拆墙的「删除当前墙」禁用并提示「请先撤销拆除」；已拆墙不显示「标记拆除当前墙」
- [x] 级联安全：`.compact-only`（`min-width: 601px` 时 `display:none`）在源文件顺序上晚于 `.tool-button{display:flex}`，同权重后者胜出，因此宽屏不出现空的「更多」按钮；`Workbench.test.tsx` 断言触发按钮带 `compact-only` 且菜单内只剩两项
- [ ] 未验证（需真机/预览确认）：`≤600px` 窄屏打开「更多」仍能看到并可用「重置方案 / 清空家具」——未做 `mobile_390` / `desktop_1280` 截图核对
- [x] 边界：`validateDesign` 不再要求 `measures` 字段，含 `measures` 的旧 JSON 被忽略后仍能通过校验（`geometry.test.ts` 旧 JSON 升级用例仍通过）
- [x] 回归：绘墙草稿预览仍显示长度标注（`MeasureLine` 未被误删）；拆除墙体的红色标注与拆改造价不变（`DEMOLISHED` 图层与 `costs` 测试全部通过）
