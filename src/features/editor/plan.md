# editor · 计划

## 现状

工作台已按 FSD 拆出 projects、costs、decor-styles、ai-design、report、scene-3d、dxf-import 等 Feature，编辑器只做装配与编辑操作。

## 后续

- `components/workbench.tsx`（约 1200 行）与 `components/plan-canvas.tsx`（约 1200 行）仍偏大：可按顶栏、侧栏装配、画布交互继续拆分组件与 Hook，拆分时保持现有测试不变。
- 全局样式仍集中在 `src/styles/index.css`，编辑器相关规则可在确认层叠顺序后逐步迁到 Feature 内。
