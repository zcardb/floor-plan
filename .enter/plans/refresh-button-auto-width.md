# 刷新按钮宽度自适应

## Context
项目管理页的「刷新」按钮（`.cms-refresh-button`）被写死为 `width:36px`（移动端 44px）、`padding:0`，但按钮里有图标和「刷新」两个字，所以文字溢出到边框外面（见截图）。需要让宽度跟着内容走。

## 方案
只改 `src/index.css` 里的样式，`ProjectManager.tsx` 不用动：
- 第 363 行：`.cms-refresh-button` 把 `width:36px; padding:0` 改成 `width:auto; padding:0 12px; gap:6px`，保留 `min-height:36px`、圆角和颜色。
- 第 366 行（max-width:700px）：把 `width:44px` 改成 `width:auto`，保留 `min-height:44px`，确保触屏点击区域够大。

## Implementation checklist
- [ ] 桌面端 `.cms-refresh-button` 宽度跟随内容（width:auto，左右 padding 12px）
- [ ] 移动端规则不再固定宽度 44px，高度保持 44px

## Verification checklist
- [ ] 截图 `/`（desktop_1280）：「刷新」图标和文字都在按钮边框内，并且仍然在「新建项目」左侧
- [ ] 刷新中（转圈动画）按钮宽度不跳动
- [ ] 运行 `pnpm vitest run src/features/interior/components/managementUi.test.tsx` 和 `pnpm run build` 通过
