# 家具详情：点击「完成」也保存价格

## 背景
账号家具库中打开家具详情（内置家具、新建的自定义家具都用同一个 `AccountFurnitureDialog`），目前只有点「应用」才会保存单价。用户在输入框改了价格后直接点「完成」，修改会被丢掉。目标：**「应用」和「完成」都会保存价格**。

## 方案
1. **`PriceInput.tsx`**（复用现有校验 `validPrice` 和提示逻辑）
   - 把内部 `apply()` 改为返回 `boolean`（成功 true；校验失败、保存失败、抛错为 false）。
   - 新增可选 `ref` 属性（React 19 直接把 ref 当 prop 传），通过 `useImperativeHandle` 暴露 `flush(): Promise<boolean>`：
     - 输入框内容和当前 `value` 一致（未改动）或组件处于 disabled → 直接返回 true，不重复保存；
     - 有改动 → 走同一个 `apply()`，返回结果。
   - 其他使用 `PriceInput` 的地方（项目内的属性面板、报价编辑等）不传 ref，行为不变。
2. **`AccountFurnitureDialog.tsx`**
   - 用 `useRef<PriceInputHandle>` 绑定价格输入。
   - 「完成」按钮改为：先 `await flush()`，成功才关闭弹窗；失败（如金额无效、保存失败）则留在弹窗内并显示现有错误提示。
   - 底部状态文案「价格应用后自动保存」改为「点击应用或完成即保存价格」（自定义家具保留「新图片需手动保存」后半句）。
3. **`AccountCostDialog.tsx`**（同一账号库页里地面/墙面/门窗等的单价弹窗，同样有「完成」按钮）做相同处理，保持一致；描述文案同步改为「点击应用或完成即保存」。

不变：右上角 X / Esc / 点遮罩关闭仍是直接关闭（不保存）；新建家具表单本身已在「创建家具」时保存价格，不改动。

## 关键文件
- `src/features/interior/components/PriceInput.tsx`
- `src/features/interior/components/AccountFurnitureDialog.tsx`
- `src/features/interior/components/AccountCostDialog.tsx`

## Implementation checklist
- [ ] `PriceInput` 的 `apply()` 返回 boolean，原有成功/失败提示保持不变
- [ ] `PriceInput` 导出 `PriceInputHandle` 类型并通过 `ref` 暴露 `flush()`；未改动或 disabled 时返回 true 且不调用 `onApply`
- [ ] `AccountFurnitureDialog` 的「完成」先 flush，成功后才 `onOpenChange(false)`
- [ ] `AccountFurnitureDialog` 状态文案更新
- [ ] `AccountCostDialog` 的「完成」先 flush，成功后才 `done()`；文案更新

## Verification checklist
- [ ] 正向：打开「三人沙发」，输入 400 后直接点「完成」→ 弹窗关闭、提示已更新、卡片显示 ¥400
- [ ] 正向：输入后点「应用」仍正常保存（行为不变）
- [ ] 默认：不改价格直接点「完成」→ 直接关闭，不触发保存、无多余提示
- [ ] 边界：输入非法金额（如 -1）点「完成」→ 不关闭，显示「请输入非负有效金额」
- [ ] 边界：清空输入点「完成」→ 保存为未定价（与「应用」一致）
- [ ] 运行 `pnpm test`（vitest src/features/interior）、`pnpm run lint`、`pnpm run build` 均通过
