# 楼梯：梯段长、行业标准踏面/踏步、自动踏步数 + 编辑面板尺寸

## Context
上一轮楼梯已经支持 5 种形式、方向反转、左右转向和各跑梯段宽。还有三个问题：
1. **分段楼梯缺梯段长**：L 型、U 型、三跑现在只能改外框长宽和各跑宽度，不能直接设“这一跑多长”。
2. **踏步尺寸要按行业标准默认值**：踏面宽、踏步高目前只做推导和提示，用户没法设，也没有按标准给出默认值。
3. **踏步数应自动推算**：现在素材库给的是写死的 14/15/16 级，跟实际层高无关。
4. **编辑面板太长**：`stair-popover` 是竖排单列（宽 344px），加上类别卡片后高度接近屏幕高度，会盖住正在编辑的楼梯。
5. 新增的这些参数要同步进 DXF 导出，继续符合业界规范。

你确认的做法：**外框跟着梯段长自动算**；踏步数**自动推算但允许手动覆盖**；**梯段宽、梯段长、踏面宽、踏步高都可改，默认取行业标准值**。

## 一、数据模型（`model/types.ts`）
`StairSpec` 只新增可选字段，旧数据完全不受影响：
```ts
export interface StairSpec {
  form: StairForm; flightWidth: number; steps: number;
  flightWidths?: number[];      // 各跑宽
  flightLengths?: number[];     // 新增：各跑水平长度（mm），长度 = 跑数
  treadDepth?: number;          // 新增：踏面宽（mm），默认 280
  riserHeight?: number;         // 新增：踏步高（mm），默认 175
  stepsManual?: boolean;        // 新增：true 表示踏步数由用户指定，不随层高自动变
  reverse?: boolean; hand?: 'left' | 'right';
}
```

## 二、`model/stairs.ts`
- 新增常量：`STAIR_DEFAULTS = { riserHeight: 175, treadDepth: 280 }`（住宅套内常用值：踏步高 150–175、踏面宽 260–300）。`STAIR_RULES` 保持为规范下限/上限（踏步高 ≤ 200、踏面宽 ≥ 220、梯段宽 ≥ 750），推导提示继续用它。
- 新增 `stairRiser(spec)` / `stairTread(spec)`：取用户值，缺省用默认值。
- 新增 `stairSteps(floorHeight, riser)`：`clamp(round(floorHeight / riser), 3, 40)`，即层高 ÷ 踏步高并取整。
- 新增 `stairFlightLengths(spec)`：与 `stairFlightWidths` 同构；缺省时按当前外框反推出各跑长（保证旧数据渲染不变）。
- 新增 `stairSizeOf(spec)` → `{ w, d }`：由各跑长、各跑宽、平台推外框
  - 直跑：`W = w1`，`D = run1`
  - L 型：`W = w1 + run2`，`D = w2 + run1`
  - U 型：`W = w1 + w2 + 200`（梯井），`D = 平台进深 + max(run1, run2)`，平台进深取 `max(w1, w2)`
  - 三跑：`W = w1 + run2 + w3`，`D = w2 + max(run1, run3)`
  - 螺旋：按中线行走长 = 踏步数 × 踏面宽 反推，`rm = 踏步数 × 踏面宽 ÷ 300°`，`外圆 = rm + w1/2`，`W = D = 2 × 外圆`
- `stairLayout(spec, w, d)` 签名不变：**有 `flightLengths` 时以梯段长为准**（平台大小由相邻跑宽/跑长决定），没有时沿用现在“在外框内均分”的行为。旧数据和画布里的老楼梯不受影响。
- `applyStairForm(f, form, floorHeight?)`：切换类别时用预设外框推导出各跑长与各跑宽；`stepsManual` 不为 true 时按 `floorHeight` 重算踏步数。
- `validStairSpec` 增加校验：`flightLengths` 长度等于跑数、每项 600–20000 mm；`treadDepth` 为 150–400 mm；`riserHeight` 为 100–250 mm；`stepsManual` 必须是布尔值。

## 三、放置楼梯时自动推算（`components/Workbench.tsx`，`add`）
`add` 里已经能拿到 `d.height`。`it.type === 'stairs'` 时：踏步数按 `stairSteps(d.height, riser)` 写入，外框用 `stairSizeOf` 覆盖，这样新放的楼梯直接就是按当前层高算好的踏步数。素材库预设仍以外框/宽/长的标准值为准。

## 四、编辑面板（`components/StairEditor.tsx`）
复用已有的 `MeterField`、`EditorSelect`。分组显示：
- **类别**：5 个卡片（已有）
- **每跑**：每跑一组“第 n 跑宽 / m”+“第 n 跑长 / m”，两列栅格
- **踏步**：踏步数（带“自动 / 手动”标记，手动后出现“恢复自动”）、踏面宽 / m、踏步高 / m
- **方向**：行走方向、转向（已有）
- **推导结果**：外框 W×D、踏步数、实际踏步高、实际踏面宽；规范提示（GB 50096）继续只提示不拦截
- 改梯段长 / 梯段宽 / 踏面宽 / 踏步高后，同一 `p.change` 里用 `stairSizeOf` 同步更新 `f.w`、`f.d`，撤销与保存沿用现有机制

## 五、面板尺寸（`components/SelectionEditor.tsx`、`index.css`）— 参考 UI/UX 法则
问题：单列 344px 宽、内容竖排过高，触发高度就会超出屏幕，遮住编辑区域。
- `PopoverContent` 改为 `side="right"`（画布编辑区在右侧工具条左边，向右展开不会盖住选中对象），保留 `collisionPadding={12}` 让 Radix 自动避让边缘。
- `.stair-popover` 宽度 344 → 360px，新增 `max-height: min(72vh, 520px)` 与 `overflow-y: auto`（内容超高时面板内滚动，而不是无限变长）——即“就近显示 + 内容可滚动”。
- 类别卡片缩为一行 5 个、高度 48px（已有），推导结果用 2×2 紧凑网格，规范提示与 GB 说明合并为一条次要文字，减少纵向占用。
- 输入采用两列栅格（宽/长成对），符合“相关字段相邻”的接近性原则。

## 六、DXF 导出（不改图元类型，只确认新参数进入图块签名）
- 几何仍是 LINE / LWPOLYLINE / CIRCLE，楼梯在 `STAIRS` 图层，文字在模型空间且角度经过 `readableRotation()`（上一轮已完成）。
- 图块签名已经序列化整个 `f.stair`，新参数会自动产生不同的图块；本轮的验证项是把它测出来：改梯段长 / 踏面宽后块名或几何必须变化，不能复用旧块。
- 更新 `docs/features/stairs.md`（新参数、外框推导、自动踏步数）与 `docs/features/drawing-export.md`（图块签名必须包含所有影响几何的参数，含新参数）。

## Implementation checklist
- [ ] `types.ts`：`StairSpec` 增加 `flightLengths`、`treadDepth`、`riserHeight`、`stepsManual`
- [ ] `stairs.ts`：新增 `STAIR_DEFAULTS`、`stairRiser`、`stairTread`、`stairSteps`、`stairFlightLengths`、`stairSizeOf`（5 种形式的推导）
- [ ] `stairs.ts`：`stairLayout` 在有 `flightLengths` 时以梯段长为准，平台随之变化；缺省时行为与现在完全一致
- [ ] `stairs.ts`：`validStairSpec` 校验 4 个新字段；`applyStairForm` 接收层高并重算踏步数（`stepsManual` 除外）
- [ ] `Workbench.tsx`：放置楼梯时按 `d.height` 自动写踏步数并用 `stairSizeOf` 定外框
- [ ] `StairEditor.tsx`：每跑“宽 + 长”、踏步数（自动/手动 + 恢复自动）、踏面宽、踏步高，推导结果里显示外框
- [ ] `SelectionEditor.tsx` + `index.css`：`side="right"`、`max-height: min(72vh, 520px)`、面板内滚动、两列栅格
- [ ] `docs/features/stairs.md` 与 `drawing-export.md` 同步新规则

## Verification checklist
- [ ] 正向：直跑设梯段长 4.00 m → 外框长为 4000、11 条以上踏步线按 `steps` 均分；设梯段长 2.80 m → 外框随之变短
- [ ] 正向：L 型设第 1 跑长 2.40 / 第 2 跑长 1.60 → 外框 `W = w1 + 1600`、`D = w2 + 2400`，平台为 w1 × w2
- [ ] 正向：U 型设两跑长不等时，行走线仍贯通两个梯段，梯井与平台分界线存在
- [ ] 正向：螺旋设踏面宽 300、踏步数 13 → 外圆 = `13 × 300 ÷ (300° 弧度) ÷ 2 + w1/2` 对应值，`W = D = 2 × 外圆`
- [ ] 正向：层高 2800、踏步高 175 → 自动踏步数 16；层高改 3200 → 变 18（未手动时）
- [ ] 正向：手动改踏步数后标记为“手动”，再改层高不变；点“恢复自动”后跟随层高
- [ ] 正向：踏面宽 / 踏步高的默认值分别为 280 / 175，界面显示与实际值一致
- [ ] 正向：编辑面板在 L 型时出现“第 1 跑长 / 第 2 跑长”，直跑时只有 1 组，三跑时 3 组
- [ ] 界面：`desktop_1280` 截图确认面板为单列窄面板、高度不超过约 72vh、溢出时内部滚动、不盖住选中楼梯（若无缝可截图，改为人工确认）
- [ ] DXF：改变梯段长或踏面宽后，楼梯图块几何或块名随之变化（不复用旧块）；楼梯块内仍无 TEXT；`STAIRS` 图层 ACI / 线宽 / 线型不变
- [ ] DXF：旋转 180° 的楼梯“上”字仍可读；左转楼梯不出现负比例
- [ ] 默认：没有新字段的旧楼梯渲染与现在完全一致，现有 stairs 测试保持通过
- [ ] 负向：`flightLengths` 长度不对、某项 100、`treadDepth: 50`、`riserHeight: 500`、`stepsManual: 'yes'`，`validateDesign` 均拒绝
- [ ] 边界：外框极小（1000×1000）与梯段长极大（20 m）时都不出现 NaN 或负尺寸
- [ ] 构建：`pnpm test` 全绿、`pnpm run build` 通过、改动文件 eslint 无错误
