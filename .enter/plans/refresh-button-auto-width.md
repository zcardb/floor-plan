# 项目卡片标题：最多两行省略，卡片尺寸固定，悬浮显示全名

## Context
1. 「刷新」按钮被写死为 36px 宽（移动端 44px）且 `padding:0`，图标加文字溢出到边框外。
2. 项目名很长时，卡片标题（`.cms-card h2`）会一直换行，把卡片撑高（截图里有 6 行）。期望：标题最多两行，超出部分显示省略号；卡片高度固定，不随名称长短变化；悬浮时用 tooltip 显示完整名称。

## 方案
**刷新按钮**（`src/index.css`）
- 第 363 行 `.cms-refresh-button`：`width:36px; padding:0` 改成 `width:auto; padding:0 12px; gap:6px`。
- 第 366 行（max-width:700px）：`width:44px` 改成 `width:auto`，保留 `min-height:44px`。

**卡片标题**（`src/index.css` 第 229 行 `.cms-card h2`）
- 加上 `line-height:1.5; height:3em`（固定占两行高度，短标题的卡片也一样高，所有卡片对齐）。
- 加上 `display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; overflow-wrap:anywhere`（第二行末尾显示省略号；没有空格的长英文或数字也能断行）。

**Tooltip 显示全名**（`src/features/interior/components/ProjectManager.tsx`）
- 卡片上已经有一层盖住整张卡片的「打开」按钮（`.cms-card-open`），悬浮在标题上时显示的就是它的 `EditorTooltip`。把提示文字从 `打开 ${row.name}` 改成只显示完整的 `row.name`，不再新增第二个 tooltip，避免两个提示重叠。
- 现有的 `.tool-tooltip` 已经有 `max-width:240px`，长名称会在 tooltip 里自动换行，不需要改。

## Implementation checklist
- [ ] `.cms-refresh-button` 桌面端和移动端都改成宽度跟随内容（`width:auto`），左右 padding 12px
- [ ] `.cms-card h2` 最多两行，超出部分显示省略号，固定高度 `3em`
- [ ] `.cms-card h2` 加 `overflow-wrap:anywhere`，没有空格的长字符串也能截断
- [ ] `ProjectManager.tsx` 卡片 `EditorTooltip` 的 label 改为 `row.name`

## Verification checklist
- [ ] 截图 `/`（desktop_1280）：长名称卡片标题只显示两行，末尾有省略号；它的高度和「Home」卡片一样
- [ ] 短名称（「Home」）只有一行，卡片高度不变，日期和操作按钮的位置和长名称卡片对齐
- [ ] 悬浮在长名称卡片上，tooltip 显示完整名称，并在 240px 宽度内换行
- [ ] 「刷新」按钮的图标和文字都在边框内，并且仍然在「新建项目」左侧
- [ ] 运行 `pnpm vitest run src/features/interior/components` 和 `pnpm run build` 通过
