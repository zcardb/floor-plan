# AI 输入框「数量」下拉文案调整

## Context

两处 AI 入口（「AI 创建户型」弹窗与房间 AI 弹窗）共用 `AiComposer`：底部右侧的下拉当前显示「2 个方案」，展开后是「1 个方案 / 2 个方案 / 3 个方案 / 4 个方案」，同一个词组重复四遍，且与「查看上一次的 2 个方案」这类结果文案混在一起。

用户要求把这个下拉改成「数量」语义：触发器显示「数量 2」，下拉项只显示数字 `1 / 2 / 3 / 4`。仅改文案与可访问名，不改交互、默认值（默认仍是 2）、模型选择与发送逻辑。

## 改动点

### 1. `src/features/interior/components/AiComposer.tsx`

- 第 122 行触发器可见文案：`{value.count} 个方案<ChevronDown size={12} />` → `数量 {value.count}<ChevronDown size={12} />`。
- 第 122 行 `aria-label`：`` `方案数量，当前 ${value.count} 个` `` → `` `数量，当前 ${value.count}` ``。
- 第 126 行下拉项，由 `{n} 个方案` 改为只显示数字：

  ```tsx
  {AI_COUNT_OPTIONS.map((n) => (
    <DropdownMenuRadioItem key={n} value={String(n)} aria-label={`数量 ${n}`}>{n}</DropdownMenuRadioItem>
  ))}
  ```

  `aria-label` 保留语义（读屏念「数量 1」），但界面上不再出现「个方案」；`DropdownMenuRadioGroup` 的 value/onValueChange 逻辑不动。
- 第 29 行组件顶部注释里「「数量」下拉（1–4）」保持不变，无需修改。

### 2. `src/index.css`

- `.ai-count-menu`（第 4014 行）现在是 `min-width: 120px`，下拉项只剩单个数字后过宽，改为 `min-width: 96px`（保留 `font-size: var(--fs-control)`），让菜单收紧但仍容纳左对齐的选中圆点（`pl-8`）与两位数字。
- 其余样式不动：`.ai-composer-count` 药丸样式同时被 `AiEnginePicker` 复用，不改。

### 3. `src/features/interior/components/aiComponents.test.tsx`

- 第 113 行断言 `expect(html).toContain("2 个方案")` 改为 `expect(html).toContain("数量 2")`，并补一条 `expect(html).not.toContain("个方案")`，锁住「初级表单里不再出现『个方案』」这一新契约（`AiResults` 的「正在生成 N 个方案」不在该表单的静态标记里，不受影响）。
- 第 104 行的用例标题（「数量默认 2」）语义已对齐，不改。

不改动：`AI_COUNT_OPTIONS`、`DEFAULT_AI_COUNT`、`useAiBatch`、`AiResults` 的「N 个方案 / 已生成 N 个方案」文案，以及 `AiRoomDialog` / `AiCreateProjectDialog`。

## Implementation checklist

- [ ] `AiComposer.tsx` 触发器可见文案变为「数量 {count}」
- [ ] `AiComposer.tsx` 触发器 `aria-label` 变为「数量，当前 {count}」
- [ ] `AiComposer.tsx` 下拉项渲染 `{n}` 并带 `aria-label={`数量 ${n}`}`，不再出现「个方案」
- [ ] `index.css` 中 `.ai-count-menu` 的 `min-width` 调整为 96px
- [ ] `aiComponents.test.tsx` 第 113 行断言更新为「数量 2」并新增「不包含『个方案』」断言

## Verification checklist

- [ ] `pnpm test -- src/features/interior/components/aiComponents.test.tsx` 全绿（含新断言）
- [ ] `pnpm run build` 通过（类型 + 构建）
- [ ] 手动：打开「AI 创建户型」，触发器显示「数量 2」；展开下拉为 `1 / 2 / 3 / 4`；选中 4 后触发器变「数量 4」，生成出的候选数仍为 4
- [ ] 边界：房间 AI 弹窗（同一 `AiComposer`）文案一致；键盘上下键 + Enter 仍能切换数量（RadioGroup 行为未变）
- [ ] 默认态：未改动任何设置时触发器为「数量 2」，与 `DEFAULT_AI_COUNT` 一致
