# 家具库：引导提示上移 + 去掉卡片「+」徽标

## Context

用户看截图反馈两点，并按 growth.design 心理法则要求调整：

现状（`src/features/interior/components/Library.tsx`）：

1. 引导文案 `.library-tip`（「点击添加，或拖入画布 / 所有家具均按真实尺寸绘制」）挂在 `.library-grid` 之后，是侧栏的最后一块。而 `.library-panel` 是 `overflow-y: auto` 的滚动容器（`src/index.css:649`），客厅分类有 14 件、网格高约 770px，提示基本要滚到底才看得到 → **Banner Blindness / Selective Attention**：埋在长列表末尾的引导不会被看到；应改用 **Visual Anchors / Visual Hierarchy**，把引导放到列表标题之前，进入首屏。
2. 每张卡片右下角有一个 `.item-add` 的「+」徽标（`<Plus size={12} />`）。卡片本身已经整卡可点（`onClick={() => add(it)}`）且可拖拽，徽标是重复的 **Signifiers**，同时只是一个约 18px 的小目标（**Fitts's Law**）。去掉后提示成为唯一引导，需要用 **Von Restorff Effect / Contrast** 稍微提亮；但只能「稍微」，过重会重新变成 Banner Blindness。

用户已确认：干掉的是**卡片上的 + 徽标**，提示**只保留列表上方一处**。

## 方案

### 1. `src/features/interior/components/Library.tsx`

- 删除卡片内的徽标块（当前第 137–139 行）：
  ```tsx
  <span className="item-add">
    <Plus size={12} />
  </span>
  ```
- 把 `.library-tip` 整块（当前第 152–159 行）从网格之后**移动到 `.library-subheading`（「客厅家具 / 14 件」）之前**，文案与显示条件保持不变（仍无条件显示，硬装分类与搜索结果同样显示）。
- 保留提示开头的 `<Plus size={14} />`：卡片上的「+」去掉后，由它承担「+ = 添加到画布」的视觉锚点（其余 `<Plus />` 用法在「新建家具 / 账号库」按钮上，不受影响）。
- 卡片点击 / 拖拽逻辑、`add` / `setTool` / `customItems` 入参、`aria-label` 全部不动。

### 2. `src/index.css`

- 删除 `.item-add svg`（791–794）与 `.item-add`（808–817）两条规则（全项目仅此处使用，已 grep 确认）。
- 把 `.library-tip`（818–830）从「全宽底部分隔线」改为「列表上方的内嵌提示卡」，与网格保持同样的 13px 侧边距：
  ```css
  .library-tip {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0 13px 12px;
    padding: 8px 10px;
    border: 1px solid hsl(var(--primary) / 0.28);
    border-radius: 7px;
    background: hsl(var(--primary) / 0.07);
    color: hsl(var(--primary));
    font-size: 10px;
    line-height: 1.7;
  }
  .library-tip svg { flex: none; margin-top: 2px; }
  .library-tip p { margin: 0; }
  ```
  对比度核算：`--primary: 21 52% 40%`（深赭石，`src/index.css:84`）在 primary 7% 淡底上约为 5.5:1，满足 WCAG AA 小字；图标与文字同色，靠底色与描边做「稍微高亮」。
- 保留 `.library-item:hover` 的边框变主色 + `translateY(-1px)`：徽标去掉后，它是卡片唯一的悬停 affordance；卡片原有的 `EditorTooltip`（「点击或拖入画布添加 · 尺寸」）继续承担说明，无需新增提示。

### 3. `src/features/interior/components/Library.test.tsx`

沿用文件里已有的 `nodes()` 扁平化 + `harness()` 模式，新增一条用例，锁住本次两处结构变化：

- 扁平节点列表中 `className === 'library-tip'` 的索引小于 `className === 'library-subheading'` 的索引；
- 整棵树中不存在 `className === 'item-add'` 的节点；
- 点击 `aria-label === '添加三人沙发'` 的卡片仍调用 `add`（保证去掉徽标后整卡点击未回归）。

## 关键文件

- 修改：`src/features/interior/components/Library.tsx`
- 修改：`src/index.css`（`.library-tip` 818–830；删除 `.item-add` 791–794、808–817）
- 修改：`src/features/interior/components/Library.test.tsx`（新增 1 条用例）
- 复用：`src/components/ui/editor-tooltip.tsx`（卡片既有悬停说明，不新增）
- 不动：`Workbench.tsx`、`AccountFurnitureLibrary.tsx`、其他面板与数据流

## 不做的部分

- 不改点击 / 拖拽 / 添加逻辑与 `add` 数据流。
- 不给提示加按分类或搜索隐藏的条件逻辑。
- 不做 sticky / 折叠提示等额外交互。

## Implementation checklist

- [x] `Library.tsx` 删除 `item-add` 徽标块，卡片仍保留 `onClick={() => add(it)}`、`draggable`、`aria-label="添加X"`
- [x] `Library.tsx` 把 `.library-tip` 块移动到 `.library-subheading` 之前，且全文件只保留一处 `.library-tip`
- [x] `Library.tsx` 提示文案与 `<Plus size={14} />` 保持不变，`Plus` 仍被「新建家具 / 账号库」按钮引用（无未使用 import）
- [x] `index.css` 删除 `.item-add` 与 `.item-add svg` 两条规则（`grep -n "item-add" src` 仅剩无匹配）
- [x] `index.css` 重写 `.library-tip` 为内嵌提示卡（`margin: 0 13px 12px`、primary 淡底 + 描边 + primary 文字），并与 `.library-grid` 的 13px 侧边距对齐
- [x] `Library.test.tsx` 新增用例：`library-tip` 索引先于 `library-subheading`、不存在 `item-add` 节点、`添加三人沙发` 卡片点击仍触发 `add`

## Verification checklist

- [x] `pnpm lint`：0 error（只出现既有的 PlanCanvas `useEffect` warning）
- [x] `pnpm exec tsc --noEmit`：无类型错误
- [x] 新增的 `Library.test.tsx` 用例通过；`pnpm test` 全量仍有 2 个文件失败（`model/drawingExport.test.ts`、`model/wallPolicy.test.ts`），来自其他会话未提交的 `drawingExport.ts` / `drawingExport.test.ts` 改动，与本次 Library 改动无关，故此项未标完成
- [x] `pnpm run build`：构建成功
- [x] `website_screenshot`（`desktop_1280`，`http://localhost:3000/`，客厅分类默认态）：提示卡位于「客厅家具 / 14 件」标题**上方**且在首屏可见；网格内每张卡片都没有「+」徽标；底部不再出现第二处提示
- [ ] `mobile_390`：`.library-panel` 在窄屏是抽屉（`drawer` 默认 `null`，需点击才展开），无法用 URL 截图触达该状态，未做视觉验证；抽屉内仍复用同一套 `.library-tip` 样式与 13px 边距，CSS 层面无新增裁切风险
- [x] 边界：提示块为无条件静态渲染，位置固定在 `.library-subheading` 之前，与「硬装」分类、搜索关键词两种状态无关（代码级确认，未做交互截图）；`structural-items` 工具条未改动
