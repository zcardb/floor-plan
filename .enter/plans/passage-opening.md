# 新增「垭口」（无门洞口）构件

## 背景
参考户型里厨房和餐厅之间是一个没有门的垭口：两边是墙垛，中间直接留洞，两个房间依然分开计算。目前编辑器只有「门」和「窗」两种开口（`Opening.kind: "door" | "window"`），没法画出这种效果。如果把中间那段墙删掉，`mergeRoomsAcrossWall` 又会把两边房间合并成一间。

这次新增第三种开口 `passage`（垭口）。它和门一样挂在所在墙段上：墙体轮廓仍然参与房间划分，所以两侧房间保持独立；2D 平面图上只画洞口，没有门扇；3D 场景里墙从地面开到洞口高度，没有门扇，人可以直接走过去；费用按洞口面积（宽 × 高）计价，也支持自定义垭口款式。

## 方案要点
- **统一管理开口类型元数据**：在 `model/hardMaterials.ts` 里把 `openingKinds` 扩展成 `{ value, label, standard }` 三项，并新增：
  - `openingKindLabel(kind)`：返回 门 / 窗 / 垭口
  - `defaultOpeningSize(kind)`：门 900×2100，窗 1200×1600，**垭口 1200×2100**
  
  代码里散落的 `kind === "door" ? 2100 : 1600` 和 `kind === "door" ? "门" : "窗"` 三元判断全部改为调用这两个函数。不改的话，垭口会被错当成窗处理（默认高度变成 1600，名称显示为「窗」）。
- **统一管理开口图标**：新建 `components/openingIcon.ts`，提供 `openingIcon(kind)`：门 `DoorOpen`，窗 `PanelsTopLeft`，垭口 `RectangleVertical`（lucide 图标）。
- **房间拓扑不改**：垭口所在墙段照常进入 `wallFootprints` 和 `roomEnclosure`，两侧房间不会被合并。这一点会用测试锁住。

## 实施清单
### 模型与类型
- [ ] `model/types.ts`：`Opening.kind`、`CustomOpening.kind` 增加 `"passage"`；`Tool` 增加 `"passage"`
- [ ] `model/hardMaterials.ts`：`openingKinds` 增加垭口；新增 `openingKindLabel`；`defaultOpeningSize` 支持垭口；`openingName` 改用 `openingKindLabel`；`validCustomOpening` 接受 `passage`
- [ ] `model/costs.ts` 的 `openingDimensions`：默认高度改用 `defaultOpeningSize(o.kind).height`（窗台高仍只对窗生效，垭口为 0）
- [ ] `model/selectionEdits.ts`：校验「洞口顶部不超过层高」时，默认高度改用 `defaultOpeningSize`
- [ ] `model/validation.ts`：开口类型白名单加入 `"passage"`，保证含垭口的方案能保存和加载
- [ ] `model/wallContacts.ts`：`opening.kind` 类型改为 `Opening["kind"]`
- [ ] `model/accountCostEntries.ts`：内置价格条目增加 `{ key: 'passage', name: '垭口' }`
- [ ] `ai/types.ts`：两处开口 `kind` 类型改为 `Opening["kind"]`（`ai/context.ts` 会原样传出 `kind`，不改会报类型错误；AI 生成逻辑本身不改）

### 绘制与导出
- [ ] `components/PlanCanvas.tsx`（2D）：开口渲染改为三个分支。垭口画两条贯穿墙厚的边线，沿墙两侧各画一条虚线（表示上方过梁），不画门扇和开启弧线
- [ ] `model/drawingDocument.ts`（SVG / PDF / DXF 共用）：垭口只输出两条边线，分组名为「垭口」，不输出门扇和弧线
- [ ] `scene/Scene3D.tsx`：沿用现有洞口切割逻辑（窗台高 0、高度取 `openingDimensions`），垭口不生成门扇和玻璃；漫游时的 `blocked` 判断里垭口可以通行（现有逻辑已满足，确认即可）
- [ ] `model/planThumbnail.ts`：垭口和门一样在缩略图上留洞（现有逻辑已满足，不需要改）

### 放置工具与界面
- [ ] `components/PlanCanvas.tsx`：放置开口的判断从 `door || window` 扩展到 `passage`，宽度取 `defaultOpeningSize(tool).width`；点到已有开口时结束工具的判断同样扩展
- [ ] `components/Workbench.tsx`：在顶部主工具栏的结构工具组里（截图红框位置）**紧跟「绘墙」后面**加一个「垭口」`ToolButton`，顺序为 选择 · 绘墙 · 垭口 · 门 · 窗。它和门、窗一样受 `structureTools` 控制，激活态为 `tool === "passage"`，图标用 `RectangleVertical`；选中后点击墙体即可在点击位置生成垭口，放好自动切回「选择」。操作提示文案加上垭口；删除后的提示改用 `openingKindLabel`
- [ ] 左侧素材库（`Library.tsx`）不加入口，垭口只从顶部工具栏放置
- [ ] `components/PropertyPanel.tsx`：标题、默认高度、删除按钮文案、图标改用新的 helper；开向设置仍然只对门显示
- [ ] `components/SelectionEditor.tsx` 和 `components/SizeFields.tsx`：默认高度改用 `defaultOpeningSize`（窗台高输入框仍只对窗显示）
- [ ] `components/OpeningVariantSelect.tsx`：标准款名称改用 `openingKinds` 里的 `standard` 字段（显示为「标准垭口」）
- [ ] `components/CustomOpeningForm.tsx`、`components/AccountMaterialList.tsx`、`components/CostItemVisual.tsx`、`components/CustomFurnitureDialog.tsx`、`components/WallSplitDialog.tsx`：名称、占位文案、图标改用 `openingKindLabel` 和 `openingIcon`

### 后端
- [ ] 新增数据库迁移：把 `interior_opening_catalog.kind` 的 CHECK 约束放宽为 `('door','window','passage')`。只删除并重建这一条约束，不动表里的已有数据

### 测试
- [ ] `model/validation.test.ts`：含 `passage` 的方案能通过校验；未知类型仍然被拒绝
- [ ] `model/costs.test.ts`：没有设置高度时，垭口的 `openingDimensions` 为窗台高 0、高度 2100，面积 = 宽 × 2.1
- [ ] `model/drawingExport.test.ts`：导出时垭口没有 arc 实体，`OPENINGS` 图层上有 2 条边线
- [ ] `components/PlanCanvas.test.tsx`：用垭口工具点击墙体后，生成 `kind: "passage"`、宽度为 1200 的开口并切回选择工具
- [ ] `model/wallRemoval.test.ts` 或新增测试：在参考户型厨房和餐厅之间的隔墙上加垭口后，两个房间仍然独立存在，费用里出现「垭口」条目

## 验证清单
- [ ] 正向：顶部工具栏「绘墙」右边出现「垭口」按钮（与门、窗同组）；点击后按钮高亮，再点击隔墙，画布上出现两条边线和虚线过梁，没有门扇；选中后可以沿墙拖动，可以修改宽和高
- [ ] 正向：切换到 3D，洞口从地面开到 2.1 m，上方保留过梁，没有门扇，漫游可以穿过
- [ ] 正向：费用面板「门窗」类目出现「垭口」，按 m² 计价；可以新建自定义垭口款式并切换使用
- [ ] 负向：承重墙上放垭口仍然提示「承重墙不可新增开口」；墙段长度不够或与已有开口重叠时给出相应提示
- [ ] 边界：垭口高度超过层高时被拒绝；旧项目（只有门和窗）照常加载，渲染不变
- [ ] 导出：SVG、PDF、DXF 中垭口只有边线，没有开启弧线
- [ ] 执行 `pnpm vitest run src/features/interior`、`pnpm run lint`、`pnpm run build`，全部通过
