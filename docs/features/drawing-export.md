# 导出规范（CAD / DXF）— 强制

新增或修改任何家具、结构、标注时，都必须满足本文件。导出逻辑集中在 `src/features/interior/model/`：

| 文件 | 职责 |
| --- | --- |
| `drawingDocument.ts` | 从 `Design` 生成与格式无关的 `DrawingDocument`（图元、尺寸、图块、插入） |
| `drawingStyle.ts` | 导出配色、图层样式表、DXF 颜色 / 线宽 / 线型表 |
| `furnitureDrawing.ts` | 把家具的 SVG 符号转成图元；DXF 与 SVG / PDF 共用 |
| `dxfExport.ts` / `svgExport.ts` / `pdfExport.ts` | 三种格式的写出 |

## 1. 图元

- 只能使用已支持的 SVG 标签：`g`、`line`、`rect`、`circle`、`ellipse`、`path`、`text`。出现别的标签会在导出时抛错。
- 图元只允许：折线（含闭合）、圆弧、圆、椭圆、文字。
- 平面图的绘制入口必须是 `FurnitureShape`（画布、缩略图、导出共用），不要在组件里画导出不了的东西。
- 旋转用 `rotate()`，不使用 `skew`（导出无法表达）。等比缩放的圆和椭圆会写成真正的 CIRCLE / ELLIPSE，非等比缩放会退化成折线。

## 2. 图层

- **每个对象类别一个图层**，并在两处登记后才能在导出里出现：
  - `drawingDocument.ts` 的 `DrawingLayer` 与 `DRAWING_LAYERS`、`DRAWING_LAYER_NAMES`（中文名，界面和 PDF 图层名用）
  - `drawingStyle.ts` 的 `LAYER_STYLES`（导出配色）与 `DXF_LAYER_STYLES`（ACI 颜色、线宽、线型）
- 图层命名参照天正（`WALL`、`WINDOW`、`STAIR`、`AXIS`…）和 AIA（`A-WALL`、`A-DOOR`、`A-FLOR-STRS`…）。现有：`WALLS`、`WALL_HATCH`（仅 DXF）、`DEMOLISHED`、`ROOMS`、`OPENINGS`、`FURNITURE`、`STAIRS`、`ROOM_LABELS`、`DIMENSIONS`。
- 线宽用标准档位（1/100 mm），单位为毫米；`$INSUNITS` 与 `$MEASUREMENT` 已在 `dxfExport.ts` 里设置，不要改成米或英寸。
- 图层中文名要与 `layerNames.ts` 的匹配规则一致（`layerNames.test.ts` 有一条守护测试）。

## 3. 图块（BLOCK + INSERT）

- 重复出现的符号（家具、门窗）必须写成图块：CAD 里能整块选中、替换、统计数量。
- 块名可读，格式 `<前缀>_<类别>_<宽>x<高>`，例如 `FURN_sofa_1800x800`、`DOOR_900x240`、`STAIR_L_2400x2400`。
- 按几何签名去重；同名但签名不同时递增后缀 `_2`、`_3`。签名要包含所有影响几何的参数（例如楼梯的 `stair` 全部字段）。
- **块内不放文字**：INSERT 旋转会连带把块内文字转成倒的。文字作为模型空间的 TEXT 单独写，图层与几何相同。
- **不用负比例插入**（组码 41/42 为负）：负比例块在 CAD 里炸开后文字和标注都会反向。镜像必须写进几何坐标。

## 4. 文字

- 制图标准（GB/T 50001 附录、ISO 128）要求文字从图纸下方或右侧阅读，也就是 DXF 角度不落在 (90°, 270°]。
- 所有文字角度都要经过 `drawingDocument.ts` 的 `readableRotation()`；`transformEntity` 和 `furnitureDrawing` 已自动处理，新增文字走这两条路径即可。
- 文字样式固定用 `STUDIO_CN`（`simplex.shx` + `gbcbig.shx`），否则中文在 AutoCAD 里显示成 `?`。
- 字号写毫米模型尺寸，不要写屏幕像素。

## 5. 尺寸与标注

- 尺寸用 DIMENSION 实体加匿名显示块（`*D<n>`，`BlockFlags.AnonymousBlock` 与 `dimensionType |= 32`），保证在任何 CAD 里都显示为图形加数值。
- 子类型目前支持对齐（Aligned）。要加角度、半径、坐标标注时，参照 `AlignedDimension` 换成对应的类，并把显示块里的箭头、界线、文字一起画出来。

## 6. 必须有的测试

`src/features/interior/model/drawingExport.test.ts`：

- **回读**：用 `dxf-parser` 解析导出的 DXF，检查实体类型、图层、无 `NaN`。
- **图层**：每个图层在 DXF 表里的 ACI 颜色、线宽（组码 370）、线型与 `DXF_LAYER_STYLES` 一致。
- **守护测试**：素材库全部家具在多个旋转角下都能导出、回读，所有图层都已登记，所有 TEXT 角度都可读。新增家具会自动被这条测试覆盖。
- **往返**：SVG / DXF / JSON 导出再导入，方案深度相等。

## 7. 当前已知缺口（未做）

CIRCLE / ELLIPSE 导入、SPLINE 与凸度多段线、块属性 ATTDEF / ATTRIB、MTEXT、HATCH（除墙体外的图案填充）、引线 LEADER / MULTILEADER、角度 / 半径 / 坐标标注、布局与图框、弧形墙、柱、轴线轴号、标高符号、门窗编号与门窗表。要补哪一项，先更新本文件再实施。
