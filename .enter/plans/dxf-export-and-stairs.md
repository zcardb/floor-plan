# 楼梯：行走方向反转、左转/右转、每跑单独梯段宽

## Context
楼梯旋转后，“上”字、起步点和箭头只会跟着整体转，没办法单独指定哪一头是上行起点。另外，L 型、U 型、三跑楼梯的几跑现在只能共用一个梯段宽。你确定要做三件事：
1. **行走方向反转**：起步端和箭头对调，“上”字和折断线跟着移到新的第一跑。
2. **转向**：L 型、U 型、三跑可以选左转或右转，右转和左转互为镜像。
3. **每跑单独设梯段宽**：L 型、U 型有 2 跑，三跑有 3 跑。平台大小跟着各跑宽度变化。

不做：标注文字切换“上/下”、文字保持正向、每跑单独设踏步数、3D 视图改动。

## 一、数据（`model/types.ts`，`StairSpec` 只新增可选字段，旧数据不受影响）
```ts
export interface StairSpec {
  form: StairForm; flightWidth: number; steps: number;
  /** L / U / 三跑各跑梯段宽（mm），长度 = 跑数；缺省时每跑都用 flightWidth。 */
  flightWidths?: number[];
  /** 行走方向反转：起步端与箭头对调。 */
  reverse?: boolean;
  /** 转向：默认 right（第一跑上行后向右转，即当前图样）；left 为左右镜像。仅 L / U / 三跑生效。 */
  hand?: 'left' | 'right';
}
```
- `model/stairs.ts` 新增：
  - `stairFlightCount(form)`：直跑 1、L 型 2、U 型 2、三跑 3、螺旋 1
  - `stairFlightWidths(spec)`：有 `flightWidths` 就用它，否则用 `flightWidth` 补满跑数
- `validStairSpec` 增加三项校验：`flightWidths` 的长度必须等于跑数，每项在 300–5000 mm 之间；`reverse` 必须是布尔值；`hand` 只能是 `left` 或 `right`。
- `applyStairForm` 切换类别时清掉这三个字段，回到该类别的预设值。
- 修改某一跑宽度时，写入完整的 `flightWidths`，同时让 `flightWidth` 等于第 1 跑的宽度，保持兼容。

## 二、几何（`stairLayout` 重构，统一“梯段描述 → 标记”）
- 各类别先按**正向、右转**算出 `lines`、`outline`、`walk`，以及 `flights: {start, end, width, tread}[]`，即每一跑的中线起止点、宽度和踏步宽。
- **每跑宽度**：
  - L 型：第 1 跑 f1 在左列，第 2 跑 f2 在顶行，平台为 f1×f2。run1 = d − f2，run2 = w − f1。
  - U 型：f1 在左列，f2 在右列，中间留梯井；顶部平台进深取 max(f1, f2)。f1 + f2 不超过 w。
  - 三跑：f1 在左列，f2 在顶行，f3 在右列；两个平台分别是 f1×f2 和 f3×f2。run2 = w − f1 − f3。
  - 每跑宽度都会被夹到外框能容纳的范围内，避免出现负尺寸。
- **标记统一函数** `flightMarks(flight, n)`：在第一跑上放起步点（沿行走方向 t/2 处）、“上”字（第一跑右手侧）、折断线（第一跑中点，45° 斜向）。直跑和多跑共用这个函数，螺旋楼梯保留现有的标记位置。
- **反转**：`walk` 倒序，箭头画在新终点，用最后一跑的反向作为第一跑来生成标记；踏步线和外框不变。螺旋楼梯同样适用。
- **左转**：对 L 型、U 型、三跑的全部点做 x 取负。因为是直接改坐标、不用 transform，“上”字不会被镜像成反字。
- `StairLayout.flightWidth` 改为各跑中的最小值，供规范提示使用；`treadDepth` 继续取各跑踏步宽的最小值。

## 三、编辑面板（`components/StairEditor.tsx`）
- 抽出一个 `MeterField` 小组件：米制输入，失焦或回车时提交，超出范围就报错并回滚。原来的梯段宽字段和新的每跑宽度字段都用它。
- **梯段宽**：
  - 直跑和螺旋楼梯：仍是一个“梯段宽 / m”。
  - L 型、U 型：显示“第 1 跑 / m”“第 2 跑 / m”两栏。
  - 三跑：显示三栏，共用现有的 `.visual-size-fields` 栅格。
- **方向**：复用 `EditorSelect`，参考 `DoorOrientationControls` 的写法：
  - “行走方向”：正向 · 由此端起步 / 反向 · 由另一端起步
  - “转向”（只在 L 型、U 型、三跑时显示）：右转 / 左转
- 所有修改都走 `p.change`，所以撤销和保存沿用现有机制。

## 四、联动（不需要额外改动，只需验证）
- 画布、缩略图、SVG/PDF/DXF 导出都通过 `StairPlan` 或 `furnitureDrawing` 取图样，会自动带上方向和宽度。
- DXF 图块签名里已经包含整个 `f.stair` 对象，所以方向不同的楼梯会生成不同的块。

## Implementation checklist
- [ ] `types.ts`：`StairSpec` 增加 `flightWidths?`、`reverse?`、`hand?`
- [ ] `stairs.ts`：新增 `stairFlightCount`、`stairFlightWidths`；`validStairSpec` 校验三项新字段；`applyStairForm` 清空它们
- [ ] `stairs.ts`：L 型、U 型、三跑按每跑宽度计算几何和平台，宽度会被夹取
- [ ] `stairs.ts`：新增 `flightMarks`；`reverse` 反转 walk、箭头、起步点、“上”字、折断线；`hand: 'left'` 对 L/U/三跑做 x 取负
- [ ] `StairEditor.tsx`：`MeterField`、每跑宽度栏、行走方向和转向两个 `EditorSelect`

## Verification checklist
- [ ] 正向：直跑 `reverse: true` 时，起步圆点 y < 0（在上端），箭头终点 y > 0；踏步线数量不变
- [ ] 正向：L 型 `hand: 'left'` 时，第一跑的踏步线都在 x > 0 一侧，外框多边形与右转版左右对称；“上”字的 text 元素没有 transform
- [ ] 正向：L 型设 `flightWidths: [1200, 800]` 后，平台为 1200×800，第 1 跑踏步线长 1200，第 2 跑踏步线长 800
- [ ] 正向：编辑面板在三跑时显示 3 个宽度栏，在直跑时显示 1 个；转向下拉只在 L/U/三跑出现
- [ ] 正向：`validateDesign` 经 JSON 往返后，`flightWidths`、`reverse`、`hand` 都保留
- [ ] 默认：没有新字段的楼梯渲染结果与当前一致（现有 stairs 测试保持通过）
- [ ] 负向：`flightWidths` 长度不对、某项为 100、`hand: 'up'`、`reverse: 'yes'`，`validateDesign` 都会拒绝
- [ ] 边界：外框 1000×1000，每跑宽 3000，L/U/三跑都不出现 NaN 或负尺寸
- [ ] 构建：`pnpm test` 全绿，`pnpm run build` 通过，改动文件的 eslint 无错误
