# 视觉编辑器弹层 + 右侧属性面板：UI 整体评审与改造方案

> 依据：growth.design 心理学框架（ux-psychology / growth-design-review / ux-psychology-review 三个技能，均从上游实时读取）+ 你给的案例站点。
> 已实施。（上一项「接触点分割」已完成，与本方案无关。）

## Context

截图 150 / 151 / 152 和当前代码显示，两块编辑界面——选中对象后的**浮动工具条弹层**（`SelectionEditor.tsx`）和**右侧属性面板**（`PropertyPanel.tsx`）——在字号、按钮尺寸、留白、对齐上各自为政。

根因：同一份 `SizeFields` / `PriceField` 在两处渲染，却同时受四套规则影响：`.visual-editor-popover`、`.property-panel`、shadcn 组件自带的类、移动端媒体查询。最终显示效果取决于谁的优先级高，没有统一的刻度。

- **页面类型**：编辑器（Dashboard / Web App），不是转化页面
- **首要目标**：选中对象后，快速、准确地改尺寸和单价
- **目标用户**：做户型和报价的设计师，以桌面端为主

---

## 一、UX 心理学评审

### 做得好的地方
- **Feedback Loops**：尺寸「改动即时生效」；单价有「未应用 · 回车应用，Esc 还原」提示，输入框会高亮。
- **Confirmation / 防丢失**：关闭时未应用的价格会提示「已放弃」；同步到账号库失败时，项目价格保持不变。
- **Default Effect**：账号库未定价时，「同步到账号库」默认勾选，符合多数人的意图，也可以取消。
- **Progressive Disclosure**：操作说明收进可关闭的提示条，不常驻占位。

### 问题

| # | 原则 | 代码位置 | 问题 |
|---|---|---|---|
| 1 | **Visual Hierarchy** | `SizeFields.tsx:47` 用 shadcn `<Label>`（14px / 500） | 「宽度 / m」（14px）比分组标题「尺寸与位置」（`.property-subtitle` 10px）还大，层级颠倒（截图 151） |
| 2 | **Law of Similarity** | 输入框实际 13px（`Input` 的 `text-[13px]` 覆盖了 `.editor-control` 的 12px）；「旋转 90°」14px（`Button` 的 `text-sm`）；「旋转 / °」10px | 同一行有三种字号（截图 150 / 151） |
| 3 | **Law of Proximity** | `index.css:2542` 的 `.visual-editor-popover label` 设为纵向排列 | 单价弹层的勾选框被挤到文字上方（截图 152） |
| 4 | **Law of Proximity** | `PriceField.tsx:46` 的「恢复账号默认」借用 `.back-link`（自带 `margin-bottom: 18px`） | 恢复按钮掉到「项目覆盖」下方，下面空出一大块 |
| 5 | **Cognitive Load** | `.mini-label` 9px、`.cost-detail > small` 9px，弹层 `p` / `.price-field-meta` / `.footnote` / `.panel-note` 均为 10px | 9–10px 的中文难以辨认；同步后果说明因此等于被藏起来了 |
| 6 | **Fitts's Law** | 画布缩放按钮 25px、面板折叠按钮 27px；`.property-actions button` 31px 高但只有 10px 字、12px 图标 | 点击目标小，且同一面板里 31px 与 36px 按钮混排 |
| 7 | **Mental Model / Familiarity** | 顶栏 2D/3D 选中时为深色实底；「属性 / 成本」选中时为白底主色字、外高 44；分割弹窗选中时为白底黑字 | 同一种控件有三种选中外观 |
| 8 | **Aesthetic-Usability** | 圆角混用 3 / 4 / 5 / 6 / 7 / 8 / 10 / 12px | 整体显得拼凑，削弱报价工具的精度感 |

### 暗黑模式风险
未发现操纵性设计。需要注意一点：「同步到账号库」默认勾选会影响其他项目。现在的说明文字已经写清后果，属于正当的引导，但**说明文字必须改到 ≥11px**，否则后果提示实际上看不清。

---

## 二、Growth Design 审计

**主要瓶颈**：用户不是不想改，而是**扫不清**。层级颠倒（Block 阶段）加上同组控件字号不一致（Interpret 阶段），每次编辑都要重新找字段、重新辨认状态。

| B.I.A.S. | 状态 | 发现 |
|---|:-:|---|
| Block（注意力 / 层级） | 不通过 | 字段标签比分组标题大；面板内部间距在 4–18px 之间不规则跳动 |
| Interpret（理解） | 不通过 | 勾选框和文字分开；三种分段 tab 外观不同 |
| Act（操作） | 部分通过 | 主操作「应用」位置正确，但按钮尺寸不一；画布按钮只有 25px |
| Store（反馈 / 收尾） | 通过 | 有 toast 成功提示，恢复默认价也有反馈 |

| C.L.E.A.R. | 分数 | 依据 |
|---|:-:|---|
| C 文案 | 4/5 | 清楚，后果说明到位 |
| L 布局 | 2/5 | 第一行上下错位；勾选行纵向排列；恢复按钮下方空白 |
| E 强调 | 2/5 | 层级颠倒；三套选中态；按钮字号 10 / 12 / 13 / 14px 混用 |
| A 可访问性 | 3/5 | 有焦点环和 aria，但 9–10px 文字和 25px 目标不达标 |
| R 反馈 | 4/5 | 即时预览、未应用提示、toast 齐全 |
| **合计** | **15/25** | |

Web App 原型规则：*Zero Chart Junk* 不通过（`mini-label` 的描边小框；分组标题和区块标题样式过于接近）。*North Star Hierarchy* 通过（成本总额常驻在 tab 上）。

---

## 三、改造方案

### 1. 统一刻度（`src/index.css` 的 `:root`），弹层和面板共用

| Token | 值 | 用途 |
|---|---|---|
| `--fs-title` | 13px | 面板标题「家具属性」、对象名称、弹层 h3 |
| `--fs-group` | 12px | 分组标题「尺寸与位置」「单价」 |
| `--fs-control` | 12px | 输入框、按钮、tab、勾选行 |
| `--fs-label` | 11px | 字段标签「宽度 / m」 |
| `--fs-meta` | 11px | 说明、来源标签、提示 |
| `--ctl-lg` / `--ctl-md` / `--ctl-sm` | 36 / 32 / 28px | 表单控件 / 次要按钮与工具栏 / 画布图标按钮 |
| `--ctl-radius` / `--ctl-radius-in` | 8 / 6px | 外框与轨道 / 内部选项与小按钮 |
| `--sp-*` | 16 / 8 / 12 / 8px | 把面板现有的 `--rp-*` 提升到 `:root`，弹层也使用同一套 |

字号只保留 11 / 12 / 13 三档，不再出现 9、10、14px。移动端（≤700px）输入框保持 16px，防止 iOS 聚焦时页面缩放；同一行的按钮相应调到 14px、标签调到 12px，保证比例一致。

### 2. P1 · 修复层级颠倒与字号混乱
- `SizeFields.tsx`：`<Label>` 加上 `className="field-label"`，新增 `.field-label`（11px / 500 / 次要色），用来覆盖 shadcn 的 `text-sm`。
- `.property-panel .property-subtitle` 与 `.visual-editor-popover h3` 统一为 12px / 600 / 前景色，保证分组标题比字段标签醒目。
- `.editor-control` / `.editor-action` 移出 `@layer components` 改为普通规则，否则会被 Tailwind utilities 覆盖，12px 无法生效。`.editor-action svg` 设为 15px。
- 把上面列出的所有 9 / 10px 说明文字统一改为 11px。

### 3. P1 · 单价弹层布局（截图 152）

```
双人床 1.8m 单价                          13px / 600
元 / 件              [项目覆盖] 恢复账号默认   同一行，11px，两端对齐
☑ 同步到账号库（账号库未定价）               同一行，勾选框在左，12px
[ 2000             ] [应用并同步]           同为 36px 高
将同时更新账号默认价，所有未单独调价…          11px
───────────────
查看软装 / 硬装成本                         12px 主色
```

- `.price-sync-option` 加一条高优先级规则：横向排列、左对齐，覆盖弹层通用 label 的纵排。
- 新增 `.price-field-source`（横向排列，间距 6px）和 `.price-restore`（11px、主色、无外边距、带焦点环）。`PriceField.tsx` 不再使用 `.back-link`。
- 行与行间距 8px；「查看成本」上方留 12px 并加一条细分隔线，把它和编辑区分开（Common Region）。

### 4. P1 · 尺寸表单（截图 150 / 151）
- `.visual-size-fields` 的间距在弹层和面板里统一为 12 / 8px，删掉面板里单独的那条覆盖规则。
- 「旋转 90°」按钮与角度输入框顶部对齐，都是 36px 高、12px 字。
- 弹层内边距统一 16px，宽度固定 280px。

### 5. P2 · 右侧面板结构
- `PanelModeTabs`：外层内边距与面板左右边距对齐（16px）；轨道内边距 3px、圆角 8；选项高 30px、圆角 6（整体外高 36，原来是 44）。
- `.panel-heading` 用 13px；「选中对象」去掉描边小框，改为 11px 次要色文字。
- `.property-actions` 按钮改为 32px 高、12px 字、14px 图标；「复制 / 删除」用 outline，「置顶 / 置底」用 ghost，保持主次。

### 6. P2 · 全局一致性
- 三处分段 tab（`.view-switch`、`.panel-mode-track`、`.wall-split-segmented`）统一规格，选中态统一为：卡片底色 + 前景色文字 + 600 字重 + 轻阴影。2D/3D 切换不再使用深色实底。
- 画布按钮 25 / 27px → 28px；顶栏和浮动工具条按钮统一 32px，图标 16px。

### 不改
`button.tsx`、`input.tsx`、`label.tsx` 的变体（项目管理等页面也在用），以及所有交互逻辑、文案和控件顺序。

## 关键文件
- `src/index.css`：刻度 token、各选择器统一、新增 `.field-label` / `.price-field-source` / `.price-restore`
- `src/features/interior/components/SizeFields.tsx`：`<Label>` 加 `field-label`
- `src/features/interior/components/PriceField.tsx`：`back-link` → `price-restore`
- `src/features/interior/components/PropertyPanel.tsx`：只在 CSS 覆盖不了按钮图标尺寸时才改

## Implementation checklist

**P1 层级与字号**
- [x] `:root` 新增 `--fs-*`、`--ctl-*`、`--ctl-radius*`、`--sp-*`
- [x] `SizeFields.tsx` 的 `<Label>` 加 `field-label`；`.field-label` 为 11px / 500 / 次要色
- [x] `.property-subtitle` 与弹层 `h3` 统一为 12px / 600 / 前景色
- [x] `.editor-control` / `.editor-action` 移出 components 层，12px 生效；`.editor-action svg` 15px
- [x] `.mini-label`、弹层 `p`、`.price-field-meta`、`.footnote`、`.panel-note`、`.cost-detail > small`、`.price-entry small` 改为 11px
- [x] ≤700px：输入框 16px，同行按钮 14px，标签 12px

**P1 单价弹层**
- [x] `.price-sync-option` 在弹层内横向一行、左对齐
- [x] 新增 `.price-field-source`、`.price-restore`；`PriceField.tsx` 不再使用 `.back-link`
- [x] 「元 / 件」与「项目覆盖 · 恢复账号默认」同一行，下方没有空白
- [x] 「查看软装 / 硬装成本」上方有 12px 间距和细分隔线

**P1 尺寸表单**
- [x] `.visual-size-fields` 间距统一为 12 / 8px，删除面板的单独覆盖
- [x] 「旋转 90°」与角度输入框顶部对齐，同为 36px 高、12px 字

**P2**
- [x] `PanelModeTabs` 外层内边距 16px，轨道 3px / 圆角 8，选项 30px / 圆角 6
- [x] `.panel-heading` 13px；`mini-label` 去掉描边
- [x] `.property-actions` 按钮 32px / 12px / 图标 14px
- [x] 三处分段 tab 规格和选中态一致
- [x] 画布按钮 28px；顶栏与浮动工具条按钮 32px、图标 16px
- [x] 新增样式只用语义 token，不写死颜色

## Verification checklist
- [x] `pnpm exec vitest run src/features/interior` 全部通过（不改逻辑，测试数量不变）
- [x] `pnpm exec tsc -p tsconfig.app.json --noEmit`、lint、`pnpm run build` 通过
- [ ] 工作台相关选择器中不再有 `font-size: 9px` / `10px`
- [x] 在 `desktop_1280` 和 `mobile_390` 下截图工作台：分段 tab 外高一致，按钮等高，无溢出
- [ ] 弹层和选中后的右侧面板需要先在画布上点选对象，截图工具做不到。这些会如实标注为「未经预览验证」，请你确认以下 5 点：
  1. 「尺寸与位置」比「宽度 / m」更醒目
  2. 「旋转 90°」与输入框同高、同字号
  3. 勾选框和「同步到账号库」在同一行
  4. 「恢复账号默认」与「项目覆盖」在同一行，下方无空白
  5. 同一字段在面板和弹层里字号一致
- [ ] 暗色模式下，字段标签与背景的对比度 ≥ 4.5:1
