# Interior 编辑器 UI 规范

本目录（`src/features/interior`）下所有新增或修改的 UI 都按这份规范来做。数值统一取自 `src/index.css` 顶部的编辑器刻度变量，**不要另外写死数字**。

## 1. 刻度变量（`src/index.css` `:root`）

| 用途 | 变量 | 值 |
|---|---|---|
| 标题 | `--fs-title` | 13px |
| 分组 / 控件文字 | `--fs-group` / `--fs-control` | 12px |
| 标签 / 辅助信息 | `--fs-label` / `--fs-meta` | 11px |
| 输入框 | `--fs-input` | 12px（触屏设备 16px，防止 iOS 自动放大） |
| 控件高度 | `--ctl-lg` / `--ctl-md` / `--ctl-sm` | 36 / 32 / 28px |
| 圆角 | `--ctl-radius` / `--ctl-radius-in` | 8 / 6px |

- 字号只允许 **11 / 12 / 13** 三档，不要出现 10px、14px 等其它字号。
- 颜色只能用语义 token（`hsl(var(--foreground))`、`--muted-foreground`、`--accent` 等），不要用 `text-white` 这类写死的颜色。

## 2. 选中对象浮动工具条（`.visual-selection-editor`）

统一规格：**11px、常规字重、按钮最小高度 `--ctl-md`（移动端 ≤600px 为 34px）、gap 5px、padding 0 8px、圆角 `--ctl-radius-in`**。

| 元素 | 图标尺寸 |
|---|---|
| 功能图标（尺寸、材质、开向、旋转、删除、详细属性等） | `size={15}` |
| 下拉箭头 `ChevronDown` | `size={12}` |

新增入口时：
- **用原生 `<button type="button">`**，并加上 `aria-label`。它会自动继承 `.visual-selection-editor > button` 和 `.editor-tooltip-trigger > button` 的统一样式。
- 需要弹层时用 `<PopoverTrigger asChild><button …/></PopoverTrigger>`，写法参考 `SelectionEditor.tsx` 里的「材质」和「开向」。
- 需要提示时用 `EditorTooltip` 包一层。

## 3. 不要在工具条 / 面板里直接用 shadcn `<Button>`

shadcn `Button` 的基础类会带上 `text-sm font-medium`（14px、500 字重）、`h-9`（36px）和 `[&_svg]:size-4`（图标强制 16px）。这些都**不会**被工具条的 CSS 覆盖，结果就是按钮比旁边的入口更大、更粗（之前「开向」就是这个问题）。

如果确实需要复用一个基于 `Button` 的组件（比如 `WallOptionsMenu`），必须在 `index.css` 中用**不在 `@layer` 里**的规则把这几项改回来：
```css
.xxx-trigger svg { width: 12px; height: 12px; }
.visual-selection-editor .xxx-trigger { height: auto; min-height: var(--ctl-md); padding: 0 8px; font-size: inherit; }
```
同时把它加进移动端 `min-height: 34px` 的规则里。

## 4. CSS 放置规则

- 编辑器控件样式写在 `index.css` 中 `@layer` **之外**，否则会被 Tailwind utilities 覆盖。
- 选择器挂在对应的语义 class 上（例如 `.visual-cost-trigger`），不要在组件里写行内样式或一次性的 Tailwind 尺寸类。
- 不要添加在 CSS 中没有定义的 class（例如以前的 `visual-door-direction`）。

## 5. 自查清单（每次改动 UI 后）

- [ ] 字号只有 11 / 12 / 13，并且通过变量引用
- [ ] 工具条按钮的高度、字号、字重、图标尺寸和相邻按钮一致
- [ ] 没有在工具条或面板里直接使用 shadcn `Button`；如果复用了，已按第 3 节覆盖样式
- [ ] 移动端（390 宽）下按钮高度为 34px，工具条可以换行
- [ ] `pnpm run lint`、`pnpm test`、`pnpm run build` 全部通过
