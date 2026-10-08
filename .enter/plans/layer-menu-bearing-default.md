# 图层菜单：承重墙高亮默认开启 + 修复勾选框间距

## Context
- 图层下拉中的「承重墙高亮」目前默认关闭（`Workbench.tsx` 第 175 行 `bearing: false`），需要改为默认开启。
- 下拉项里勾选框与右侧文字紧贴：`DropdownMenuItem`（`src/components/ui/dropdown-menu.tsx`）是 `flex items-center` 但没有 `gap`，`.layer-checkbox`（`src/index.css` 第 557 行）也没有外边距，并且在 flex 中可能被压缩。

## 方案
1. `src/features/interior/components/Workbench.tsx`
   - `layerState` 初始值 `bearing: false` 改为 `bearing: true`。画布已有逻辑 `PlanCanvas.tsx` 第 669-671 行按 `layers.bearing` 使用 `var(--plan-bearing)` 着色，无需其他改动。
2. `src/components/ui/dropdown-menu.tsx`
   - 在 `DropdownMenuItem` 的基础类名中加入 `gap-2`，让图标/勾选框与文字统一留出 8px 间距（图层菜单和文件菜单同时受益，属于设计系统层面的修复，不在组件里写一次性样式）。
3. `src/index.css`
   - `.layer-checkbox` 增加 `flex-shrink: 0`，保证勾选框保持 14×14 不被挤压。

不改动：图层开关的切换逻辑、其它图层的默认值、导出逻辑、测试夹具中的 `bearing` 值。

## Implementation checklist
- [ ] `Workbench.tsx` 中 `layerState` 的 `bearing` 初始值为 `true`
- [ ] `dropdown-menu.tsx` 的 `DropdownMenuItem` 基础类包含 `gap-2`
- [ ] `index.css` 的 `.layer-checkbox` 含 `flex-shrink: 0`

## Verification checklist
- [ ] 正向：新打开工作台，图层菜单中「承重墙高亮」默认勾选，2D 画布承重墙以高亮色显示
- [ ] 反向：点击取消「承重墙高亮」后承重墙恢复普通墙色，再次点击可重新开启
- [ ] 边界：「辅助网格」仍默认未勾选，其余四项默认勾选不变
- [ ] 视觉：图层菜单每一项勾选框与文字之间有 8px 间距；文件菜单图标与文字间距正常、无换行或错位
- [ ] `pnpm run lint`、`pnpm vitest run src/features/interior/components`、`pnpm run build` 全部通过
