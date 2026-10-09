# 选中工具条尺寸统一（「开向」过大 + 同类问题走查）

## 背景 / 根因
选中对象后的浮动工具条 `.visual-selection-editor`（`src/index.css:2443`）的统一规格是：**11px 字号、常规字重、按钮最小高度 `--ctl-md`（32px）、gap 5px、padding 0 8px**。尺寸、材质、单价、旋转、删除等都用原生 `<button>`，自动继承这套规格。

「开向」（`SelectionEditor.tsx:335`）却用了 shadcn `<Button variant="ghost" size="sm">`，它的 cva 类带来：
| 来源 | 效果 | 是否被工具条 CSS 覆盖 |
|---|---|---|
| `text-sm font-medium` | 14px、500 字重 | 否 → 文字明显偏大偏粗 |
| `[&_svg]:size-4` | 门图标、下拉箭头都被强制成 16px | 否 → 图标偏大 |
| `h-9` | 高度 36px | 否 → 比其它按钮（32px）高 |
| `px-3 gap-2` | — | 是（被 `.visual-selection-editor > button` 覆盖） |

`visual-door-direction` 这个 class 在 CSS 里没有任何定义。

## 走查发现的其它问题（同一工具条）
说明：当前沙箱里无法启动无头浏览器来点选对象并截图（Chrome 启动即崩溃），所以以下结论来自逐个按钮的计算样式审查；修改后会通过预览手动确认。

1. **「墙选项」（选中墙体时）**：`WallOptionsMenu.tsx:23` 同样用了 shadcn `Button`。`.wall-options-trigger`（`index.css:21`）已经把字号改成 12px，但工具条其它按钮都是 11px；`[&_svg]:size-4` 还把下拉箭头强制成 16px（其它下拉箭头是 12px）。这个组件也在右侧属性面板里用到（`index.css:3783`），所以只调整它在工具条里的样式。
2. **「单价」金额文字**：`.visual-cost-trigger span` 是 10px（`index.css:3049`），比旁边的「0.90 m」（11px）小，这也是截图里「未定价」看起来偏小的原因。另外 `index.css:9` 已经规定编辑器字号只用 11 / 12 / 13 三档。下拉箭头是 11px，其它是 12px。
3. **「详细属性」图标**：`Settings2 size={16}`，其它图标按钮都是 15px。

## 方案
**`src/features/interior/components/SelectionEditor.tsx`**
- L335：「开向」改成与「材质」相同的原生按钮：
  `<button type="button" aria-label="调整门开向"><DoorOpen size={15} />开向<ChevronDown size={12} /></button>`，去掉 `visual-door-direction`。`Button` 的 import 保留（拖动手柄还在用）。
- 单价触发器的 `ChevronDown size={11}` 改成 `12`。
- 详细属性的 `Settings2 size={16}` 改成 `15`。

**`src/features/interior/components/WallOptionsMenu.tsx`**
- `ChevronDown size={14}` 改成 `12`（表明意图；实际尺寸由下面的 CSS 控制）。

**`src/index.css`**
- 新增：`.wall-options-trigger svg { width: 12px; height: 12px; }`，覆盖 `[&_svg]:size-4`。index.css 里的这类规则不在 layer 内，所以会压过 Tailwind 工具类。
- 新增：`.visual-selection-editor > .wall-options-trigger { font-size: inherit; }`，让工具条里的「墙选项」跟着用 11px；属性面板里仍然是 12px。
- `.visual-cost-trigger span` 的 `font-size: 10px` 改成 `var(--fs-meta)`（11px）。

不改其它按钮、颜色或布局，移动端规则保持不变。

## Implementation checklist
- [ ] `SelectionEditor.tsx`：「开向」从 shadcn `Button` 改成原生 `<button type="button">`，图标为 15 / 12，删除 `visual-door-direction`
- [ ] `SelectionEditor.tsx`：单价下拉箭头从 11 改成 12；详细属性图标从 16 改成 15
- [ ] `WallOptionsMenu.tsx`：下拉箭头从 14 改成 12
- [ ] `index.css`：新增 `.wall-options-trigger svg` 12px 规则和 `.visual-selection-editor > .wall-options-trigger { font-size: inherit }`
- [ ] `index.css`：`.visual-cost-trigger span` 字号改为 `var(--fs-meta)`
- [ ] 确认 `SelectionEditor.tsx` 里 `Button` import 仍被使用，没有未使用的导入

## Verification checklist
- [ ] 选中门：「开向」的字号、字重和高度与「0.90 m」「未定价」一致，门图标 15px、箭头 12px
- [ ] 点「开向」仍能打开「门开向」弹层，修改开向后生效；悬停时出现「门开向」提示
- [ ] 选中墙：工具条里「墙选项」为 11px，箭头 12px，高度与相邻按钮一致；下拉菜单正常展开
- [ ] 属性面板里的「墙选项」仍是 12px，布局不变
- [ ] 选中窗、家具、房间时工具条正常，单价文字为 11px，详细属性图标为 15px
- [ ] 移动端（390 宽）：工具条可以换行，按钮高度 34px 的规则依然生效
- [ ] 运行 `pnpm run lint`、`pnpm test`（vitest，范围 `src/features/interior`）和 `pnpm run build`，全部通过
