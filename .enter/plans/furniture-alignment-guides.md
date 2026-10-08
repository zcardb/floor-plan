# 家具拖动对齐线与自动吸附

## 背景
现在 2D 平面图拖动家具时，只会吸附到墙边（`geometry.ts` 的 `snapMove`），并以 10mm 为最小步长，家具之间没有任何对齐提示。目标是做到和飞书画板一样：拖动某件家具时，如果它的左边、中线、右边（或上边、中线、下边）接近另一件家具的对应位置，就显示一条虚线对齐线，并自动吸附到这条线上。

## 交互规则
- **对齐基准**：拖动中的家具和其他家具都按外接矩形（旋转后也取外接矩形）计算：
  - X 方向比较 左边 / 中线 / 右边
  - Y 方向比较 上边 / 中线 / 下边
  - 任意两个基准互相匹配，所以“边对边”“中对中”“边对中”都能吸附。
- **吸附范围**：屏幕上 8px 以内（`8 / view.s` 毫米），缩放后手感保持一致。
- **X、Y 两个方向各自独立**：可以同时出现一条竖线和一条横线。
- **和贴墙吸附的优先级**：每个方向分别比较家具候选和墙体候选，取距离更近的那个。没有命中时，仍按原来的 10mm 网格取整。
- **虚线显示**：使用 `--plan-selection` 颜色，线宽 `1 / view.s`，虚线样式。线的长度从拖动中的家具延伸到所有落在同一条线上的家具（和 Figma 一样，多件家具共线时用一条线串起来）。
- **只在拖动时显示**：松手、取消或开始双指缩放时清除。导出图片时不包含（加 `data-export-hide`）。
- **跟随“吸附”图层开关**：关闭吸附后，既不显示对齐线，也不做家具吸附（和现在的墙体吸附行为一致）。
- 范围只包括 2D 平面图中**移动家具**。旋转、缩放手柄、墙体和门窗的拖动不变。3D 拖动继续使用原来的 `snapMove`，不显示对齐线。

## 实现方案

### 1. 新模型：`src/features/interior/model/furnitureAlignment.ts`
- `export interface AlignmentGuide { axis: 'x' | 'y'; at: number; from: number; to: number }`
- `export function snapFurniture(f, p, d, snap, tol): { point: Point; guides: AlignmentGuide[] }`
  - 取消吸附时：返回 10mm 网格取整的结果，`guides: []`。
  - 墙体候选：复用从 `snapMove` 抽出来的按方向计算的墙体吸附逻辑（见第 2 步），得到每个方向的值和距离。
  - 家具候选：遍历 `d.furniture` 中除自身外的家具，用 `aabb()` 算出它们的 3 个 X 基准和 3 个 Y 基准，再和拖动中家具在原始点 `p` 处的基准比较，得到每个方向最小的偏移量。
  - 每个方向距离更近的候选胜出。如果胜出的是家具候选，就在这条线上生成对齐线：找出所有有基准落在这条线上（误差不超过 1mm）的家具，取它们和拖动中家具（吸附后的位置）的整体范围作为 `from/to`。

### 2. 重构 `src/features/interior/model/geometry.ts`
- 把 `snapMove` 里遍历墙体的部分抽成内部函数 `wallSnapCandidates(f, p, d, tol)`，返回 `{ x?: {v, dist}, y?: {v, dist} }`。
- `snapMove` 改为调用它，签名和行为都不变（3D 场景和现有测试继续使用）。

### 3. 渲染组件：`src/features/interior/components/AlignmentGuides.tsx`
- Props：`guides: AlignmentGuide[]`、`scale: number`。
- 渲染 `<g data-export-hide="true" pointerEvents="none">`，每条对齐线是一个带 `data-alignment-guide` 的 `<line>`，两端加小圆点作为端点标记。

### 4. 接入 `src/features/interior/components/PlanCanvas.tsx`
- 新增状态 `const [guides, setGuides] = useState<AlignmentGuide[]>([])`。
- 在 `onPointerMove` 的 `dr.kind === 'move'` 分支中，把 `snapMove(...)` 换成 `snapFurniture(f, raw, next, layers.snap, 8 / view.s)`，写入 `f.cx/f.cy`，并更新对齐线（只在内容变化时 `setGuides`）。
- 在 `finish()`、`completeTool()` 和开始双指缩放时，调用 `setGuides([])`。
- 在选中框 overlay 之前渲染 `<AlignmentGuides guides={guides} scale={view.s} />`。

## Implementation checklist
- [ ] 将 `geometry.ts` 中 `snapMove` 的墙体逻辑抽成 `wallSnapCandidates`，`snapMove` 的输出保持不变
- [ ] 新建 `model/furnitureAlignment.ts`，导出 `AlignmentGuide` 和 `snapFurniture`（左/中/右、上/中/下互相匹配，排除自身，用 `aabb` 处理旋转）
- [ ] `snapFurniture` 每个方向取墙体和家具候选中更近的一个；`snap=false` 时只做 10mm 取整，且不生成对齐线
- [ ] 对齐线的 `from/to` 覆盖所有共线家具和拖动中家具
- [ ] 新建 `components/AlignmentGuides.tsx`，用设计 token `--plan-selection` 绘制虚线，并标记 `data-export-hide` 和 `pointerEvents="none"`
- [ ] `PlanCanvas.tsx` 的家具移动改用 `snapFurniture`，容差为 `8 / view.s`，并维护 `guides` 状态
- [ ] 松手、取消、双指缩放和 `completeTool` 时清除对齐线

## Verification checklist
- [ ] 新增 `model/furnitureAlignment.test.ts`：
  - [ ] 中线差 30mm、容差 100 时吸附到对方中线，并返回一条 `axis:'x'` 的对齐线
  - [ ] 偏差超过容差时不吸附，返回 10mm 取整的点，`guides` 为空
  - [ ] `snap=false` 时不吸附，`guides` 为空
  - [ ] 只有自己时不会和自己对齐
  - [ ] 旋转 90° 的家具按外接矩形的边对齐
  - [ ] 墙边更近时选墙体候选，且不生成家具对齐线
  - [ ] 三件家具共线时，对齐线的 `from/to` 覆盖全部三件
- [ ] 现有 `geometry.test.ts`（`snapMove` 用例）继续通过
- [ ] `PlanCanvas.test.tsx` 新增一条用例：拖动家具靠近另一件家具时出现 `[data-alignment-guide]`，松手后消失
- [ ] 运行 `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build` 全部通过
- [ ] 在预览中手动验证：拖动三人沙发靠近另一张沙发或火炉时出现虚线并吸附，导出 2D 图片中没有虚线
