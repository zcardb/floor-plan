# 楼梯（STAIR）— 强制

楼梯是一种家具（`type === 'stairs'`），但平面图样、参数和图层都与普通家具不同。相关文件：

| 文件 | 职责 |
| --- | --- |
| `model/types.ts` | `StairForm`、`StairSpec`、`Furniture.stair`、`LibraryItem.stair` |
| `model/stairs.ts` | 预设、参数推导、平面几何（`stairLayout`）、规范提示（`stairMetrics`） |
| `components/StairPlan.tsx` | 把几何画成 SVG 图样 |
| `components/StairEditor.tsx` | 专属编辑面板（类别、各跑宽、踏步数、方向、转向） |
| `data/catalog.ts` | 素材库里引入 `stairLibrary` |

## 1. 类别与参数

- 五种类别：`straight` 直跑、`l` L 型、`u` U 型、`triple` 三跑、`spiral` 螺旋。
- 参数：`flightWidth`（第 1 跑宽）、`flightWidths`（多跑各跑宽，长度必须等于跑数）、`steps`（总踏步数）、`reverse`（行走方向反转）、`hand`（`left` / `right`，仅 L / U / 三跑）。
- 外框仍是家具的 `w` × `d`，用户可以在「尺寸与位置」里改；踏步在外框内均分。
- **旧数据兼容**：没有 `stair` 字段的楼梯按 `{ straight, flightWidth: w, steps: 12 }` 处理（`stairSpec`），图样与历史一致。
- 校验（`validStairSpec`）：`steps` 为 3–40 的整数；每个梯段宽在 300–5000 mm；`flightWidths` 长度等于跑数；`hand` 只能是 `left` 或 `right`。

## 2. 平面图样必须画出的内容（GB/T 50104）

1. 踏步线、平台分界线、梯井边线（`lines`）
2. 行走线（各跑中线的折线）加终点箭头（`walk`、`arrow`）
3. 起步圆点（`start`、`startRadius`）
4. 「上」字（`label`、`labelSize`），放在第一跑右手侧
5. 第一跑上的 45° 折断线（`breakLine`）
6. 外框轮廓（`outline`：矩形、多边形或圆）

- 几何全部由 `stairLayout(spec, w, d)` 计算，组件只负责画，不要在组件里写几何。
- 局部坐标：外框中心为原点，起步在下方 +y，向 −y 上行。
- 各跑宽必须夹到外框能容纳的范围内，任何外框尺寸都不能产生负尺寸或 `NaN`。
- `reverse` 只改行走方向与标记（起点、箭头、「上」字、折断线换到另一头），踏步线和外框不变。
- `hand: 'left'` 直接镜像坐标（`x` 取负），**不要**用 `scale(-1 1)` 变换：镜像变换会把「上」字变成反字，导出时也会违反“不使用负比例”的规定。

## 3. 规范提示（`stairMetrics`）

依据 GB 50096 套内楼梯：梯段净宽 ≥ 0.75 m、踏步宽 ≥ 0.22 m、踏步高 ≤ 0.20 m；扇形踏步在距内侧 0.25 m 处量踏步宽。
只提示、不拦截，界面上用警告样式显示。踏步高 = `Design.height` ÷ 踏步数。

## 4. 导出

- 楼梯在单独的 `STAIRS` 图层（天正 `STAIR` / AIA `A-FLOR-STRS`），不与普通家具混在 `FURNITURE`。见 `drawing-export.md`。
- 图块名前缀 `STAIR_`，签名包含整个 `stair` 对象，所以类别、各跑宽、方向、转向不同的楼梯不会共用一个块。
- 螺旋楼梯的外圆与中柱要导出成 CIRCLE 而不是折线。
- 「上」字是模型空间的 TEXT（不进块），角度经过 `readableRotation()`。
- 3D 视图目前按普通家具处理，没有按类别和踏步数生成台阶，这是已知缺口。

## 5. 成本与分类

- 楼梯算**硬装**，分类名为「楼梯」（`STAIR_CATEGORY`），按件计价（`furniturePrices` 价格组）。
- 判断一律用 `isStairs()`（按 `type` 判断），这样旧数据和账号里的副本也能正确归类。
- 房内的楼梯计入该房间的硬装；全屋明细里单独成「楼梯」一行。

## 6. 必须有的测试

`src/features/interior/components/stairs.test.tsx`：

- 五种类别都能渲染，含「上」字、箭头、起步点、折断线
- 踏步线数量随踏步数变化；旧数据仍是 11 条
- 反转后起点、箭头、「上」字对调且踏步线不变
- 左转是镜像、没有 `transform` 文字
- 各跑宽生效、平台随之变化
- 边界：外框 1 m、每跑宽 3 m 时不出现 `NaN` 或负尺寸
- 校验拒绝非法 `steps` / `flightWidths` / `hand` / `reverse`
