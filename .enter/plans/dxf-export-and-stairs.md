# DXF 导出补齐 CAD 规范 + 楼梯按规范扩展

## Context
上一轮对照 DXF、CAD 和建筑制图规范做了类型缺口盘点（见 `cad-type-gap-analysis.md`）。你确定本次只做两件事：
1. **不改设计数据模型，只改导出**：DXF 补上图层颜色、线宽、虚线线型，圆形写成 CIRCLE/ELLIPSE，墙体加 HATCH 填充，家具和门窗写成 BLOCK + INSERT。
2. **楼梯按规范扩展**：分 5 类（直跑、L 型、U 型、三跑、螺旋），每类可设梯段宽和踏步数，有自己独立的平面图样和专属编辑面板。外框长宽照常可改，踏面在外框内均分。**3D 保持现状。**

其他缺口本次不做。

---

## 一、DXF 导出（不改 `Design`）

### 1. 图层样式（`model/drawingStyle.ts` 新增 `DXF_LAYER_STYLES`）
| 图层 | ACI 颜色 | 线宽 | 线型 |
| --- | --- | --- | --- |
| WALLS | 7 | 0.50 | CONTINUOUS |
| WALL_HATCH（只在 DXF 里有） | 8 | 0.00 | CONTINUOUS |
| DEMOLISHED | 1 | 0.35 | **DASHED** |
| ROOMS | 8 | 0.18 | CONTINUOUS |
| OPENINGS | 4 | 0.25 | CONTINUOUS |
| FURNITURE | 30 | 0.18 | CONTINUOUS |
| ROOM_LABELS | 2 | 0.18 | CONTINUOUS |
| DIMENSIONS | 3 | 0.13 | CONTINUOUS |

- 用 `writer.addLType('DASHED', '__ __ __', [80, -50])` 定义虚线，与 SVG/PDF 里拆除墙的 `dash: [80, 50]` 保持一致。
- `@tarikjabiri/dxf` 2.9.0 的 `DxfLayer.dxfy` 把组码 370 写死为 0。在 `dxfExport.ts` 里覆盖已创建图层的 `dxfy`，把 370 改为表中的线宽（单位 1/100 mm，都取标准档位）；同时设置 `$LWDISPLAY = 1`。

### 2. 新增导出图元 CIRCLE / ELLIPSE（`model/drawingDocument.ts`）
- `DrawingEntity` 增加两种：`{kind:'circle'; center; radius}`、`{kind:'ellipse'; center; major: Point /*长轴向量*/; ratio}`。这只是导出用的中间类型，不是设计数据。
- `furnitureDrawing.ts`：`<circle>/<ellipse>` 在相似变换下（等比缩放 + 旋转 + 平移，当前所有家具都满足）输出 circle/ellipse；遇到非等比变换仍退回原来的折线采样。另外新增对 `<text>` 的支持（楼梯的"上"字要用），输出 `text` 实体，字高和旋转都从变换矩阵推出。
- 下游各处同步：`dxfExport.writeEntity` 调用 `addCircle` 或 `addEllipse(center, 长轴端点, ratio, 0, 2π)`（y 轴翻转）；`svgExport.element` 输出 `<circle>` 或 `<ellipse transform=rotate>`；`pdfExport` 新增 `ellipsePoints` 采样（与 `arcPoints` 同样按约 20 mm 弦长）；`createDrawingDocument` 的 bounds 计算覆盖这两种新图元。

### 3. 墙体 HATCH
`serializeDxf` 遍历 WALLS 图层里的闭合多段线（DEMOLISHED 不处理），对每个调用 `addHatch(HatchPolylineBoundary, pattern({name: SOLID}), {layerName: 'WALL_HATCH'})`。墙线本身保持不变。

### 4. 家具和门窗写成 BLOCK + INSERT
- `DrawingDocument` 新增两个字段：`blocks: {name; entities /*局部坐标*/}[]` 和 `inserts: {block; point; rotation /*弧度*/; layer; groupId}[]`。
- 新增 `transformEntity(e, point, rotation)`，覆盖 polyline、arc、text、circle、ellipse 五种图元。
- **家具**：先用 `furnitureDrawing({...f, cx:0, cy:0, rot:0})` 得到局部几何，再用 `transformEntity` 得到世界坐标，放进 `entities`（SVG/PDF 照旧使用）。块按 `type | shape | w | d | stair` 签名去重，块名形如 `FURN_sofa_2400x900`，同名但签名不同时追加 `_2`。
- **门窗**：把 `createDrawingDocument` 里的门、窗、垭口绘制逻辑抽成 `openingDrawing(o, thickness)`，输出局部坐标（墙方向为 +x，洞口中心为原点）。块按 `kind | width | thickness | mirrorX | mirrorY` 去重，块名形如 `DOOR_900x240`、`WIN_1500x240`、`PASS_900x240`。
- **DXF 写出**：先写块定义（沿用尺寸块的 `writer.blocks.addBlock` 写法）；模型空间跳过已经被 INSERT 代替的 group，改为调用 `addInsert(name, cad(point), {layerName, rotationAngle: degrees(rotation)})`。这里的 y 翻转与 `degrees()` 取反配合是正确的。
- SVG/PDF 不读 `blocks` / `inserts`，输出内容不变。无载荷的外部 DXF 识别本来就会展开 INSERT，不受影响。

---

## 二、楼梯（`Furniture` 只新增一个可选字段）

### 1. 数据（`model/types.ts`，新增 `model/stairs.ts`）
```ts
export type StairForm = 'straight' | 'l' | 'u' | 'triple' | 'spiral';
export interface StairSpec { form: StairForm; flightWidth: number /*mm*/; steps: number }
// Furniture.stair?: StairSpec;  LibraryItem.stair?: StairSpec
```
- `stairSpec(f)`：没有 `stair` 字段的老楼梯视为 `{straight, flightWidth: f.w, steps: 12}`，画出来与现在一样是 11 条踏步线。
- `STAIR_PRESETS`（同时作为素材库的 5 个条目）：

| 类别 | 外框 w×d | 梯段宽 | 踏步数 |
| --- | --- | --- | --- |
| 直跑楼梯 | 1000×3600 | 1000 | 14 |
| L 型楼梯 | 2400×2400 | 900 | 15 |
| U 型楼梯 | 2100×3000 | 1000 | 16 |
| 三跑楼梯 | 2700×2700 | 900 | 17 |
| 螺旋楼梯 | 1800×1800 | 800 | 14 |

- 校验（`validation.ts`）：`form` 必须是上面 5 种之一；`steps` 为 3–40 的整数；`flightWidth` 在 300–5000 mm 之间。

### 2. 平面图样（GB/T 50104：踏步线、平台、梯井、行走线加箭头、起步点、"上"字、折断线）
`stairLayout(spec, w, d)` 只做纯几何计算。梯段宽会被夹到外框能容纳的最大值，所以改外框尺寸永远不会出错。
- **直跑**：梯段居中，n 级等分 d。
- **L 型**：左侧梯段向上，左上角是 fw×fw 平台，再接顶部梯段向右；踏步按 ⌈n/2⌉ 和 ⌊n/2⌋ 分配。
- **U 型**：左右两个平行梯段，中间是梯井，顶部是贯通平台；第一跑上行、第二跑下行。
- **三跑**：左梯段向上、左上平台、顶部梯段向右、右上平台、右梯段向下；踏步大致三等分。
- **螺旋**：外圆 R = min(w,d)/2，中柱 r = max(R − fw, 0.15R)，n 条径向踏步线均分 300° 扫角，行走线是半径 (r+R)/2 的圆弧。
- 每类都画：行走线（终点带箭头）、起步圆点、"上"字、第一跑上的 45° 折断线。

新增 `components/StairPlan.tsx`，把布局渲染成 SVG。踏步线用 `<line>`，行走线和折断线用 `<path>`，螺旋外圆和中柱用 `<circle>`，文字用 `<text text-anchor=middle dominant-baseline=central>`。`FurnitureShape` 里的 `t === 'stairs'` 分支改为调用 `<StairPlan>`。画布、素材库缩略图和导出（经由 furnitureDrawing）都自动使用新图样。文字颜色新增 `.stair-label` 设计令牌样式（`index.css`）。

### 3. 素材库（`data/catalog.ts`、`Library.tsx`）
原来的单个"楼梯"条目替换为 `STAIR_PRESETS` 生成的 5 个条目，每条带 `stair` 字段，`category` 仍是"客厅"。素材库已有的 `type === 'stairs' → 硬装` 规则不变，所以"硬装"分类下会显示 5 种楼梯，各带自己的缩略图。搜"楼梯"能搜到全部 5 种。

### 4. 专属编辑面板（新增 `components/StairEditor.tsx`，接入 `SelectionEditor.tsx`）
选中楼梯后，工具条多出一个"楼梯"按钮（lucide `Footprints` 图标），点开是 Popover：
- **类别**：5 张卡片，每张显示 `StairPlan` 缩略图和名称，当前类别高亮。切换类别时，外框、梯段宽、踏步数都换成该类别的预设值；位置和旋转保留；`catalogId` 换成新类别的值（单价随类别走）；如果名称还是预设名，也一并换成新预设名。
- **梯段宽 / m**：两位小数的米制输入，失焦或回车时提交，范围 0.30–5.00。
- **踏步数**：−/+ 按钮加整数输入，范围 3–40。
- **推导信息**：踏步宽（mm；螺旋楼梯按距内侧 250 mm 处计算）、踏步高 = `Design.height` / 踏步数。
- **规范提示**（只提示、不拦截，依据 GB 50096 套内楼梯）：梯段宽 < 750 mm、踏步宽 < 220 mm、踏步高 > 200 mm 时，显示 `AlertTriangle` 加说明文字。
- 所有修改都走 `p.change`，所以撤销、保存和云同步沿用现有机制。

不改动：3D 场景、数据库、家具通用的尺寸、旋转、复制、删除事务。

---

## Implementation checklist
- [ ] `drawingStyle.ts`：新增 `DXF_LAYER_STYLES`，覆盖 7 个图层加 WALL_HATCH（ACI 颜色、线宽、线型）
- [ ] `dxfExport.ts`：定义 DASHED 线型，图层按表设置颜色和线型，组码 370 写入线宽，设置 `$LWDISPLAY=1`
- [ ] `drawingDocument.ts`：新增 `circle`/`ellipse` 图元、`transformEntity`、`openingDrawing`，以及 `blocks`/`inserts` 字段；bounds 覆盖新图元
- [ ] `furnitureDrawing.ts`：相似变换下圆/椭圆输出 circle/ellipse，非等比变换回退折线；支持 `<text>`
- [ ] `svgExport.ts` / `pdfExport.ts`：渲染 circle/ellipse
- [ ] `dxfExport.ts`：写出 CIRCLE、ELLIPSE；WALLS 闭合多段线写出 SOLID HATCH 到 WALL_HATCH 层
- [ ] `dxfExport.ts`：块定义加 INSERT，被代替的 group 不再写散线；尺寸匿名块逻辑不变
- [ ] `types.ts`：新增 `StairForm`、`StairSpec`，`Furniture.stair?`、`LibraryItem.stair?`
- [ ] `model/stairs.ts`：`STAIR_PRESETS`、`stairSpec`（老数据回退）、`stairLayout`（5 类、梯段宽夹取）、`stairMetrics`（踏步宽、踏步高、规范提示）、`applyStairForm`
- [ ] `validation.ts`：校验 `stair` 字段
- [ ] `components/StairPlan.tsx` 和 `FurnitureShape.tsx` 的 stairs 分支；`index.css` 新增 `.stair-label`
- [ ] `catalog.ts`：单个楼梯条目替换为 5 个预设条目
- [ ] `components/StairEditor.tsx`：类别卡片、梯段宽、踏步数、推导信息、规范提示；在 `SelectionEditor.tsx` 中只对 `type==='stairs'` 显示

## Verification checklist
- [ ] 正向（`drawingExport.test.ts`）：用 `dxf-parser` 回读，各图层颜色、线型与表一致，DEMOLISHED 为 DASHED，图层记录 370 等于表中线宽
- [ ] 正向：含圆桌的方案导出后有 CIRCLE；WALLS 闭合多段线数 = HATCH 数；INSERT 数 = 家具数 + 未拆除墙上的门窗数；同尺寸的两件沙发共用一个块
- [ ] 正向：SVG 中圆桌是 `<circle>`；PDF 仍能回读，OCG 数不变
- [ ] 正向（`stairs.test.tsx`）：5 类楼梯都能渲染；直跑 n=14 时有 13 条 `<line>`；改 steps 后踏步线数随之变化；螺旋楼梯有 2 个 `<circle>`；每类都有"上"字和箭头路径
- [ ] 正向：`StairEditor` 切换为 U 型后 w/d/flightWidth/steps 等于预设，cx/cy/rot 不变；踏步数修改提交后 `validateDesign` 往返仍保留 `stair`
- [ ] 正向：楼梯导出 DXF 后，块内含 TEXT"上"；SVG/DXF/JSON 往返用例仍满足深度相等
- [ ] 默认值：没有 `stair` 字段的老楼梯，渲染为 11 条踏步线的直跑，`validateDesign` 能通过
- [ ] 负向：`steps` 为 2、41 或 12.5，`form: 'x'`，`flightWidth: 100`，`validateDesign` 都报错
- [ ] 负向：`walls: []` 时三种导出仍抛"没有可导出的有效墙体"；无载荷的外部 DXF 仍走识别流程
- [ ] 边界：外框缩到 1000×1000 时，L 型、U 型、三跑都不会画出负尺寸或 NaN（梯段宽被夹取）；踏步宽 < 220 mm 时规范提示出现，满足时不出现
- [ ] 更新 `Library.test.tsx`：硬装分类下出现 5 种楼梯，点击"添加直跑楼梯"后带 `stair` 字段
- [ ] 构建：`pnpm test` 全绿，`pnpm lint` 无新增错误，`pnpm exec tsc --noEmit` 和 `pnpm run build` 通过
- [ ] 截图：`desktop_1280` 下选中楼梯，查看编辑面板和画布图样
- [ ] 人工确认（沙箱里没有 AutoCAD）：在 AutoCAD 中打开导出文件，检查图层颜色、线宽、拆除墙虚线、墙体实心填充，以及家具能否整块选中
