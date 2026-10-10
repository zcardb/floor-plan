# 房间改为「由墙 + 房间分隔线自动计算」，墙工具收成三类，导出符合 CAD 图层规范

## 背景
现在每个房间都单独存一块固定轮廓（`Room.rings`），改墙后要靠七八个修补函数去更新这些轮廓，于是出现三类问题：
- 白块：点不中，也删不掉
- 飘窗变形
- 围出来的空间不算房间

改成业界通行做法（Revit 叫 Room Separation Line，即房间分隔线）：**每次改动后，房间都由「墙 + 房间分隔线」重新算出来**，名称和材质按位置重叠沿用。分隔线没有厚度，只用来划分空间，不出现在 3D 里，也不计价。导出的 DXF 图层采用 AIA / 美国国家 CAD 标准（NCS）的通用图层名，方便在其他软件里直接使用。

## 入口
- 顶部工具栏：选择 · 框选 · **墙 ▾** · 门 · 窗。下拉里有三项：
  - 墙
  - 垭口（已有功能，只是把原来的独立按钮挪进这里）
  - 房间分隔线（新增）
- 左侧「硬装」分类显示两组按钮，搜索也能找到：
  - **墙**：墙 / 垭口 / 房间分隔线
  - **门窗**：门 / 窗

## 核心设计
1. **数据**：`Design.separators?: { id, a, b }[]`
2. **计算房间** `deriveRooms(d, previous)`：
   - 用外框减去墙体占地和分隔线细带，再去掉与室外连通的那块，剩下每块区域就是一个房间
   - 按与旧房间的重叠面积贪心配对，沿用原房间的属性
   - 一间房被切开时，最大的一块保留原 id，其余新建并在名称后加序号
   - 合成房间的门槛：面积 ≥ 0.3 m²，且平均宽度 ≥ 200 mm
3. **改墙后统一调用 `syncRooms`**：依次执行 followSeparators → deriveRooms → dropOrphanFurniture
4. **分隔线跟随墙**：分隔线端点原本贴着某面墙的，墙移动后端点沿分隔线方向伸缩到新的墙面上；墙被删除时端点保持不动
5. **旧数据迁移** `migrateSeparators`：
   - 先只用墙算出区域；某个区域里包含 2 个及以上旧房间时，在相邻房间平行对边的中线处生成分隔线
   - 再执行一次 deriveRooms，把名称和材质沿用过来

## 导出图层映射
| 内容 | 标准图层 |
|---|---|
| 墙体 | `A-WALL` |
| 墙体填充 | `A-WALL-PATT` |
| 拆除墙 | `A-WALL-DEMO` |
| 门、垭口 | `A-DOOR` |
| 窗 | `A-GLAZ` |
| 房间边界（闭合多段线） | `A-AREA` |
| 房间名称 | `A-AREA-IDEN` |
| 分隔线（虚线） | `A-AREA-BNDY` |
| 家具 | `A-FURN` |
| 尺寸标注 | `A-ANNO-DIMS` |

导入外部 DXF 时：名称含 demo / 拆 的图层忽略；`A-AREA-BNDY` 图层识别为分隔线。

## 实施清单
### 模型
- [ ] `model/types.ts`：新增 Separator 类型、`Design.separators`、选中类型 `"separator"`、工具 `"separator"`
- [ ] `model/roomDerive.ts`：实现 `deriveRooms`
- [ ] `model/separators.ts`：实现 follow / migrate / add / remove
- [ ] `model/roomFollow.ts`：`syncRooms` 改走新流程，删除 followRooms 和 splitRoomsWithWall
- [ ] `model/geometry.ts`：`rebuildRooms` 改为委托给 `deriveRooms`
- [ ] 删除旧逻辑：`roomEnclosed.ts`、`roomMerge.ts`、`splitRoomsByWalls`、`roomHoles.ts` 中的相关调用
- [ ] `model/wallRemoval.ts`、`model/roomRemoval.ts`：改为调用 `syncRooms`
- [ ] `model/validation.ts`：增加分隔线校验，加载时执行迁移
- [ ] `data/templates.ts`、`data/floorplanBuilder.ts`：生成方案后执行迁移
- [ ] `model/externalDxf/recognize.ts`：识别结果写入 `separators`

### 调用点
- [ ] `useWallDrawing.ts`、`PlanCanvas.tsx`（拖墙）、`Workbench.tsx`（打开项目时）：统一改为调用 `syncRooms`

### 界面
- [ ] `components/WallToolMenu.tsx`：墙工具下拉
- [ ] `Workbench.tsx`：工具栏改为 选择 · 框选 · 墙 ▾ · 门 · 窗
- [ ] `Library.tsx`：「硬装」中增加墙、门窗两组按钮
- [ ] `useSeparatorDrawing.ts`：分隔线绘制，复用 `useSegmentDrawing`
- [ ] `PlanCanvas.tsx`：分隔线以虚线渲染，可点击选中
- [ ] 分隔线支持删除，属性面板显示其长度

### 导出
- [ ] `drawingStyle.ts`：建立标准图层映射，并定义 `A-AREA-BNDY` 的样式
- [ ] `drawingDocument.ts`：新增 SEPARATORS 图层；门 / 垭口与窗分别放到各自图层；垭口补画虚线过梁
- [ ] `dxfExport.ts`、`svgExport.ts`、`pdfExport.ts`：改用标准图层名
- [ ] `externalDxf`：识别拆除墙图层和分隔线图层

### 测试
- [ ] 删除已废弃的测试：roomMerge、roomHoles，以及 roomFollow 中的旧用例
- [ ] 新增 `roomDerive.test.ts`、`separators.test.ts`
- [ ] 更新 drawingExport、recognize、Workbench、Library 的测试，以及其他断言随新行为变化的测试

## 验证清单
- [ ] 截图 290：删墙后不再出现白条
- [ ] 截图 289：0.82 m² 的飘窗区能识别为房间
- [ ] 截图 294：移动墙体时飘窗保持矩形
- [ ] 厨房和餐厅之间有分隔线，两者仍是独立的房间
- [ ] 画一条分隔线可以把房间一分为二，删掉后两部分合并回原房间
- [ ] 导出的 DXF 使用标准图层名，每个房间是一条闭合多段线
- [ ] 旧项目打开时自动迁移，房间名称和材质不丢失
- [ ] `pnpm vitest run src/features/interior`、lint、build 全部通过
