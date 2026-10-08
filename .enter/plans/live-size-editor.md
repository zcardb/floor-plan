# 尺寸与位置弹窗改为「即时生效」

## Context

选中家具 / 墙体 / 门窗后，画布浮动工具条的「尺寸与位置」弹窗要求填完数字后点「应用尺寸」才生效。用户要求**改动默认即时生效，不需要再点应用**，并去掉底部按钮、点击弹窗外即关闭。

已确认的两个决策：

1. 去掉「取消 / 应用尺寸」按钮，输入即实时生效，点击弹窗外关闭。
2. 输入时实时预览，输入框失焦时合并为**一步撤销**（避免每敲一个数字多一步 Ctrl+Z）。

## 实施说明（与初版方案的差异）

动工时发现工作区已有一版并行改动（提交 `af3c778`）：尺寸弹窗被抽成 `SizeFields` 组件，并新增了 `src/features/interior/model/sizeTransaction.ts`（`begin / update / apply / cancel`：`update` 走 `preview` 只更新内存，`apply` 用 `commit(last, before)` 记一步撤销）。因此本次不再自己实现 preview/commit 流程，而是在这套事务模型上落地「即时生效」：

- 保留 `update`（输入即预览），把「应用」从按钮改成**失焦/关闭时自动 `apply`**。
- 新增 `flush()` / `isActive(token)` 两个事务方法，让「用户做了别的操作」时保留而不是回退已经看到的改动。

## 改动明细

### `src/features/interior/components/SizeFields.tsx`

- 删掉 `<form>` 与「取消 / 应用尺寸」按钮（`visual-form-actions` 区块），只留字段网格 + 错误提示 + 一行「改动即时生效」。
- `onChange`：`begin`（或 token 失效时重新 `begin`）后立即 `transaction.update(token, draft)`，画布 / 3D 实时更新；抛错时显示该字段的错误文案。
- 新增 `settle()`：失焦（或 Enter 触发 blur）时——非法输入 `cancel`（放弃本次预览），合法输入 `apply`（合并成一步撤销）。
- 卸载兜底：`useEffect` cleanup 调 `settle(true)`，覆盖「输入框仍聚焦就关闭弹窗 / 切换选中对象」导致 blur 未触发的情况（静默，不写错误提示）。
- Escape 仍为取消（回退 + 关闭），保留原行为。

### `src/features/interior/model/sizeTransaction.ts`

- 新增 `flush()`：把当前预览按 `commit(last, before)` 落成一步撤销（等价于无 token 版 `apply`）。
- 新增 `isActive(token)`：判断本地 token 是否仍有效，避免外部 `flush` 后继续输入被阻断。

### `src/features/interior/components/Workbench.tsx`

- 选中对象 / 工具 / 视图变化时、`select()`、`closePanels()` 由 `sizeTransaction.cancel()` 改为 `sizeTransaction.flush()`：改动已经显示在画布上，就应当保留并记为一步撤销，而不是回退。
- `setPanel` 关闭尺寸弹窗时不再 `cancel`（原来会在点击弹窗外时回退刚输入的尺寸）。
- 顺带修复 `exportImage` 的既有 lint 错误（三元表达式当语句用）。

### `src/index.css`

- 无改动（初版方案打算删除 `.visual-form-actions`，但 `CustomFurnitureDialog.tsx` 仍在使用该类，样式保留）。

### 不改动

`selectionEdits.ts` 校验规则与数据模型；弹窗内的颜色 / 材质 / 单价逻辑；`PropertyPanel` 中墙体和门窗也复用 `SizeFields`，因此同步获得「输入即生效、失焦记一步撤销」的行为。

## Implementation checklist

- [x] `SizeFields` 去掉 `<form>` 与「取消 / 应用尺寸」按钮，弹窗底部只剩「改动即时生效」提示。
- [x] 输入任一字段即时 `transaction.update` → `preview`，画布 / 3D 无需点击按钮即更新。
- [x] 失焦 / Enter 时 `settle()`：合法输入 `apply`（一步撤销），非法输入 `cancel`（放弃预览）。
- [x] 卸载兜底 `settle(true)`，覆盖 blur 未触发的关闭 / 切换选中对象路径。
- [x] `sizeTransaction` 新增 `flush()` 与 `isActive(token)`。
- [x] `Workbench` 的 `select` / 视图工具变化 / `closePanels` 改为 `flush()`，关闭尺寸弹窗不再 `cancel()`。
- [x] 修复 `Workbench.exportImage` 的 `no-unused-expressions` lint 错误。
- [x] 没有组件引用被删除的样式，`CustomFurnitureDialog` 用的 `.visual-form-actions` 保留。

## Verification checklist

- [x] `pnpm check`（`eslint .` + `tsc --noEmit`）通过：0 error（仅剩 `SizeFields` 既有 `react-refresh/only-export-components` warning）。
- [x] `pnpm run build` 通过。
- [x] 预览运行时无新增 console 报错（HMR 日志正常）。
- [ ] 正向：选中家具 → 打开「尺寸与位置」→ 改「宽」→ 不点任何按钮，画布与 3D 立即变化；失焦后 `Ctrl+Z` 一次回到原尺寸。（需人工在预览中点击验证，我无法模拟输入）
- [ ] 负向 / 默认：打开弹窗不动字段直接点弹窗外关闭 → 设计无变化、撤销栈无新增。
- [ ] 边界：宽 50 / 20000 实时生效；49 / 20001 不生效，失焦后提示「请输入允许范围内的有效尺寸」。
- [ ] 边界：门窗宽度 / 沿墙位置越界或与其它门窗重叠时不改变画面，失焦后提示冲突原因。
- [ ] 回归：2D 与 3D 视图各验证一次；墙体和门窗在右侧属性面板中同样即时生效。
