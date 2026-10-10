# 类型缺口盘点：对照 DXF / CAD / 建筑制图规范

## Context
你问：现有类型里，哪些是 DXF、CAD 业界规范里有、但这个项目还没有的。本文件只做盘点，不改代码。参照的规范有三层：
1. **DXF 图元层**（Autodesk DXF Reference 的 ENTITIES / TABLES 段）
2. **CAD 图层与样式层**（AIA/NCS 图层规范、ISO 13567，以及国内天正类软件的常用图层）
3. **建筑对象层**（GB/T 50001 房屋建筑制图统一标准、GB/T 50104 建筑制图标准里的平面图要素）

## 一、项目现有类型（核对过源码）
| 层面 | 现有内容 | 位置 |
| --- | --- | --- |
| 墙 | `WallKind`：bearing 承重 / exterior 外墙 / partition 隔墙 / low 矮墙；另有拆除状态 | `model/types.ts:4` |
| 门窗洞口 | `OpeningKind`：door / window / passage（垭口），以及自定义款式 `variant` | `model/types.ts:15` |
| 房间 | 多环多边形，带地面、墙面、屋面（含坡度）、吊顶材料 | `model/types.ts:31` |
| 家具 | `type: string` + 轮廓 reference / rectangle / circle；楼梯算作家具 | `types.ts:45`、`furnitureAppearance.ts:3`、`data/catalog.ts:44` |
| 标注 | 只有外围自动分段的**对齐尺寸** | `drawingDocument.ts:109` |
| 其他 | 指北角 `northAngle`、画布开关 `Layers`（grid/dims/labels/furn/bearing/snap） | `types.ts:99,162` |
| 导出图元 | LINE、LWPOLYLINE、ARC、TEXT、DIMENSION（对齐，带匿名 `*D` 块） | `dxfExport.ts` |
| 导出图层 | WALLS、DEMOLISHED、ROOMS、OPENINGS、FURNITURE、ROOM_LABELS、DIMENSIONS，**全部为颜色 7，线型都是 CONTINUOUS** | `dxfExport.ts:45` |
| 导入图元 | LINE、LWPOLYLINE/POLYLINE、ARC、INSERT（展开块） | `externalDxf/dxfSource.ts:66-79` |

## 二、DXF 图元层的缺口
| 规范图元 | 现状 | 影响 |
| --- | --- | --- |
| **CIRCLE / ELLIPSE** | 圆形家具被拆成 ≥16 段的多段线 | CAD 里没法捕捉圆心，也改不了半径 |
| **SPLINE**、带凸度的 LWPOLYLINE（bulge） | 曲线全部采样成折线 | 文件变大，曲线失真 |
| **INSERT + BLOCK**（图块） | 家具和门窗都直接炸开成散线，只有尺寸用到了匿名块 | 在 CAD 里不能整体选中、替换或统计数量，这一项缺口最大 |
| **ATTDEF / ATTRIB**（块属性） | 无 | 门窗编号、家具名和价格没法带进 CAD 明细表 |
| **MTEXT** | 只有单行 TEXT | 不支持多行说明文字 |
| **HATCH**（填充） | 无；SVG 里墙体有实心填充，DXF 里没有 | 墙体在 CAD 里是空心的，地面材质也没有图案 |
| **DIMENSION 的其他子类型**：线性(旋转)、角度、半径/直径、弧长、坐标 | 只有 Aligned | 斜墙夹角、圆桌和弧形墙都标不了 |
| **LEADER / MULTILEADER**（引线） | 无 | 没有材料引注、做法说明 |
| POINT、SOLID、XLINE/RAY、IMAGE | 无 | 优先级低 |
| **布局 / 图纸空间**（LAYOUT、VIEWPORT、图框） | 只有模型空间 | 没有出图比例和图框 |
| 导入端的 CIRCLE、ELLIPSE、SPLINE、TEXT/MTEXT、HATCH、DIMENSION | 读不进来 | 外部图纸里的房间名、圆柱、弧墙会丢失 |

## 三、图层与样式层的缺口
- **图层颜色（ACI）**：7 个图层全是 7 号色，CAD 规范要求按图层分色。
- **线型 LTYPE**：拆除墙在 SVG/PDF 里是虚线，DXF 里却是 CONTINUOUS；规范里还常用 DASHED（隐藏线、梁、吊顶）和 CENTER（轴线）。
- **线宽 Lineweight**：所有图层都没有设置。墙线、门窗线、标注线按规范应该粗细分明。
- **图层命名**：现在是自定义名字，不符合 AIA（如 `A-WALL`、`A-DOOR`、`A-GLAZ`、`A-FURN`、`A-ANNO-DIMS`）或天正（`WALL`、`WINDOW`、`DOOR_FIRE`、`AXIS`、`COLUMN`、`STAIR`、`PUB_DIM`）的命名习惯。另外缺少 `A-AREA`（面积）、`A-FLOR-PATT`（地面图案）和 `DEFPOINTS` 等图层。
- **出图比例 / 注释性**：没有比例这个属性，文字高度写死在毫米模型里。

## 四、建筑对象层的缺口（室内平面图常见、项目里没有）
**结构 / 定位**
- **柱 Column**：独立柱、墙柱，规范里一般实心填充
- **轴线 + 轴号 Grid**：点划线加圆圈编号
- **梁 Beam**：顶面投影画虚线
- **楼梯 Stair**：现在是"带踏步图案的家具"。规范要求有踏步数、上下行箭头、折断线，还要分直跑、双跑、L 形、螺旋
- 台阶、坡道、栏杆/扶手、管井/烟道

**门窗子类型**（现在只有门、窗、垭口三种）
- 门：单开、双开、子母门、推拉门、折叠门、卷帘门、旋转门
- 窗：平开窗、推拉窗、固定窗、**飘窗/凸窗**、转角窗、高窗、百叶窗；还有幕墙
- 非落地的**墙洞 / 壁龛**：passage 现在固定落地
- **门窗编号**（M1、C1……）和门窗表

**墙**
- 弧形墙：墙现在只有直线段 a→b
- 墙体材质或填充类别，比如砖、混凝土、轻钢龙骨，制图标准里用填充来区分

**注释符号**
- **标高符号**（±0.000、吊顶标高）
- **自由文字 / 说明**：现在只有房间名和面积
- **引线标注**（材料做法）
- **剖切符号、索引符号、立面指向符号**
- 手动尺寸：现在只有自动外围尺寸，没有内部或任意两点之间的尺寸，也没有角度尺寸
- 图框、标题栏、比例尺

**室内专项**（规范把它们放在各自的专业图层里）
- 电气：插座、开关、灯具、配电箱
- 给排水点位、地漏
- 空调、风口
- 吊顶造型线、地面拼花线

## 五、优先级建议（只是建议，本次不实施）
1. **P1 不改数据模型、只改导出**：图层 ACI 颜色、线宽、拆除墙用 DASHED；圆形家具写成 CIRCLE；墙体加 HATCH；家具和门窗写成 BLOCK + INSERT。
2. **P2 小幅扩展数据模型**：门窗子类型（双开、推拉、飘窗）、柱、非落地墙洞、自由文字、手动尺寸。
3. **P3 新增对象体系**：轴线和轴号、标高、楼梯参数化、水电点位、图框和比例。

## Implementation checklist
- [ ] 无代码改动。你选定要补哪些类型后，再为每项单独出实施计划

## Verification checklist
- [ ] 本盘点里"现有类型"每一项都能对应到上表列出的源码位置（已在只读调研中核对）
- [ ] 不涉及构建或测试，因为没有文件改动
