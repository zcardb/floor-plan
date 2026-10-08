# 家具拖动对齐线与自动吸附（最小步长 50mm）

## 背景
2D 拖动家具目前只贴墙吸附（`snapMove`，10mm 步长），家具之间没有对齐提示。目标：
1. 类似飞书画板，拖动家具时，左/中/右（上/中/下）接近其他家具时显示虚线对齐线并自动吸附。
2. 家具移动最小步长改为 **50mm**。

## 交互规则
- 未命中吸附时按 50mm 网格取整（2D/3D 共用 `snapMove`，统一 50mm）；墙体/家具吸附结果保持精确值。
- 对齐基准按外接矩形（`aabb`）：X 比较左/中/右，Y 比较上/中/下，任意两两匹配。
- 吸附容差：屏幕 8px（`8 / view.s`）。X、Y 独立。
- 每个方向家具候选与墙体候选取更近者。
- 虚线 `--plan-selection`，覆盖所有共线家具；仅拖动时显示，`data-export-hide`。
- 关闭"吸附"图层：不显示对齐线、不吸附，仅 50mm 取整。
- 3D 拖动不显示对齐线。

## 实现方案
1. `model/geometry.ts`：新增 `FURNITURE_STEP = 50`、导出 `wallSnapCandidates`；`snapMove` 改用它和 50mm 取整。
2. `model/furnitureAlignment.ts`：`AlignmentGuide`、`snapFurniture(f, p, d, snap, tol)`。
3. `components/AlignmentGuides.tsx`：渲染虚线。
4. `components/PlanCanvas.tsx`：家具移动改用 `snapFurniture`，维护 `guides` 状态并在结束/取消/缩放时清空。

## Implementation checklist
- [x] `geometry.ts` 新增 `FURNITURE_STEP = 50`，`snapMove` 网格取整改为 50mm
- [x] 抽出导出的 `wallSnapCandidates`，墙体吸附结果为精确值
- [x] 新建 `model/furnitureAlignment.ts`（`AlignmentGuide`、`snapFurniture`，排除自身，`aabb` 处理旋转）
- [x] 每方向取更近候选；未命中 50mm 取整；`snap=false` 无对齐线
- [x] 对齐线 `from/to` 覆盖所有共线家具与拖动家具
- [x] 新建 `components/AlignmentGuides.tsx`（`--plan-selection`、`data-export-hide`、`pointerEvents="none"`）
- [x] `PlanCanvas.tsx` 家具移动使用 `snapFurniture`，容差 `8 / view.s`，维护 `guides`
- [x] 松手、取消、双指缩放、`completeTool` 时清除对齐线

## Verification checklist
- [x] `geometry.test.ts`：`snapMove(f,[151,162],d,false)` → `[150,150]`；`[176,124]` → `[200,100]`
- [x] `furnitureAlignment.test.ts`：中线吸附+guide；超出容差 50mm 取整无 guide；`snap=false`；不与自身对齐；旋转 90°；墙更近选墙；三件共线覆盖
- [x] `PlanCanvas.test.tsx`：拖近时出现 `[data-alignment-guide]`，松手后消失
- [x] `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build` 通过
