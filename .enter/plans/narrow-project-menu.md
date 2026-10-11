# 项目下拉更窄、去掉左侧图标

## Context

工具条左侧的项目下拉（`ProjectMenu`）目前是 232px 宽，三项「返回项目管理 / 新建项目 ▸ / 切换项目 ▸」每项都带一个 16px 左侧图标（`ArrowLeft` / `Plus` / `ArrowLeftRight`）。用户反馈（见截图）：菜单太宽，而且这三个入口语义已经很清楚，左侧图标是多余的。

目标：**只保留文案 + 右侧子菜单箭头，把菜单宽度收窄**。功能（返回项目管理、新建项目子菜单、切换项目子菜单、访客态）完全不变。

## 改动

### 1. `src/features/interior/components/ProjectMenu.tsx`

- 三个入口去掉左侧图标：
  - `<DropdownMenuItem …><ArrowLeft />返回项目管理</DropdownMenuItem>` → 只留文案
  - `<DropdownMenuSubTrigger …><Plus />新建项目</DropdownMenuSubTrigger>` → 只留文案
  - `<DropdownMenuSubTrigger …><ArrowLeftRight />{…}</DropdownMenuSubTrigger>` → 只留文案
- 清理 import：`ArrowLeft`、`ArrowLeftRight`、`Plus` 不再使用；`Check`、`ChevronDown`、`Loader2` 保留。
- 其余逻辑（`pending` / `busy` / 禁用、二级菜单、`LoadMoreSentinel`）不动。

### 2. `src/index.css`（约 3920–3925 行）

- `.project-menu` 宽度 `232px` → `184px`（`width:min(184px,calc(100vw - 24px))`），比 §5.1 的单行菜单更窄，属于项目下拉的例外，需在规范里注明。
- `.project-menu [role="menuitem"].project-menu-entry`：去掉 `gap:10px`（已无左侧图标，只剩文字与右箭头）。
- 删除 `.project-menu-entry>svg { width:16px; height:16px; stroke-width:1.75; }`（现在只剩子菜单箭头，由下面的 `svg:last-child` 规则管）。保留 `svg:last-child`（14px、`--muted-foreground`、`margin-left:auto`）。
- 移动端块（`@media (max-width:600px)`）不涉及菜单宽度，无需改。

### 3. `src/features/interior/UI_GUIDELINES.md`

- §5.3 第 84 行那条「项目下拉是一个 232px 的窄菜单……」改为：约 184px 的窄菜单、三项都不放左侧图标、只保留右侧 14px 子菜单箭头（说明它比 §5.1 的单行菜单更窄）。

### 4. 测试

`toolbarMenus.test.tsx` 中项目菜单的断言用的是拼接文本（`text()`），不检查图标，去掉图标后应全部通过，预期无需改动。若出现依赖图标数量的断言再按实际结果调整。

## 验证

- `pnpm exec tsc -p tsconfig.app.json --noEmit`
- `pnpm exec vitest run src/features/interior/components/toolbarMenus.test.tsx`
- `pnpm run lint`、`pnpm run build`
- 预览里点开工具条左侧项目下拉：菜单明显比之前窄，三项都是「纯文字 + 右侧箭头」，子菜单展开位置与点击行为（返回项目管理、新建项目、切换项目）与改前一致。

## Implementation checklist

- [ ] `ProjectMenu.tsx` 三个入口去掉 `ArrowLeft` / `Plus` / `ArrowLeftRight` 图标
- [ ] `ProjectMenu.tsx` 清理不再使用的 import，保持类型检查通过
- [ ] `index.css` 中 `.project-menu` 宽度改为 184px
- [ ] `index.css` 中 `.project-menu-entry` 去掉 `gap:10px`，删除 16px 图标 svg 规则，保留右侧箭头规则
- [ ] `UI_GUIDELINES.md` §5.3 项目下拉条目更新为 184px、无左侧图标

## Verification checklist

- [ ] `pnpm exec tsc -p tsconfig.app.json --noEmit` 通过
- [ ] `pnpm exec vitest run src` 通过（重点 `toolbarMenus.test.tsx`）
- [ ] `pnpm run lint`、`pnpm run build` 通过
- [ ] 展开菜单：三项均无左侧图标，右侧箭头 14px、垂直居中
- [ ] 窄屏（≤600px）下展开菜单不溢出视口（`min(184px, calc(100vw - 24px))` 生效）
- [ ] 访客态（未登录）仍只有「切换户型 ▸」一项，无「返回项目管理」
- [ ] 点击「返回项目管理」回到项目管理页，二级菜单（新建 / 切换）行为与改前一致
