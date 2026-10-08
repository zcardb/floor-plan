# 屋面与吊顶：按房间设置，计入硬装成本

## Context
家居管理中的硬装目前有「地面 / 墙面 / 门窗」三类。为了支持自建房和别墅，现在加上**屋面**和**吊顶**两类。
- 两类都**按房间设置**：在房间的「材质」里和地面、墙面一起选择，按房间面积计价，显示在右侧该房间的成本中，做法和地面一样。
- 屋面可以设置坡度，平顶为 0°。屋面面积 = 房间面积 ÷ cos(坡度)；吊顶面积 = 房间面积。
- 两类都**算作硬装**，和左侧家具库分开，不会出现在编辑器左侧的家具 / 硬装列表中。
- 2D 和 3D 视图都不显示这两类；DXF、SVG、PDF 导出也不变。

## 数据模型（定义处）
`model/types.ts`
- `Room.roofMat?: string`：不填表示无屋面。
- `Room.roofSlope?: number`：坡度，范围 0–60°。
- `Room.ceilingMat?: string`：不填表示原顶。
- `Design.customRoofs? / customCeilings?: CustomWall[]`。
- `CostSettings.roofPrices? / ceilingPrices?`。

`model/hardMaterials.ts`
- 硬装分类改为 `HARD_CATEGORIES = ['地面','墙面','门窗','屋面','吊顶']`。
- 内置屋面材料：琉璃瓦、水泥瓦、沥青瓦、树脂瓦、石板瓦、现浇混凝土平屋面、彩钢瓦、阳光板。
- 内置吊顶材料：石膏板吊顶、铝扣板吊顶、集成吊顶。
- 新增函数：`roofMaterialOf / ceilingMaterialOf / pickableRoofs / pickableCeilings / applyRoomRoof / applyRoomCeiling / roofSurfaceArea`。

## 消费处
1. `SelectionEditor` 房间材质：增加屋面（含「无屋面」）、屋面坡度和吊顶（含「原顶」）。
2. `costs.ts` / `costBreakdown.ts`：增加 roofPrices 和 ceilingPrices 两项，按房间计入 hard；`CostCategoryList`、`RoomCostDetail` 和 `costDefaults.priceGroups` 同步增加这两项。
3. 账号家具库：在 `accountCostEntries`、`CostItemVisual`、`AccountCMS` 和 `CustomFurnitureDialog` 中接入屋面和吊顶。
4. 把 `CustomWallForm` 改为通用的 `CustomColorMaterialForm`，把 `useWallCatalog` 改为通用的 `useColorMaterialCatalog(table)`。
5. 新建 `interior_roof_catalog` 和 `interior_ceiling_catalog` 两张表，设置 owner-only RLS。现有表不改动。
6. 在 `validation.ts` 中校验新增字段。
7. 不改动：`Library`、`PlanCanvas`、`Scene3D` 以及各个导出模块。

## Implementation checklist
- [x] types.ts 新字段
- [x] hardMaterials.ts：两个分类、内置材料、相关函数
- [x] costs.ts / costBreakdown.ts 计价
- [x] RoomCostDetail / CostCategoryList / costDefaults 标签与分组
- [x] validation.ts
- [x] 两张账号库表的迁移
- [x] useColorMaterialCatalog
- [x] CustomColorMaterialForm
- [x] 账号库与新建弹窗接入
- [x] SelectionEditor 房间材质
- [x] Workbench 加载账号库并传递

## Verification checklist
- [x] 20 m² 房间、坡度 30°：屋面面积 = 20/cos30°；坡度 0 时为 20；吊顶面积为 20
- [x] 坡度会被截断到 0–60；无效的 roofMat 会被清除
- [x] 旧项目不出现屋面行和吊顶行
- [x] costBreakdown 中屋面和吊顶归到对应房间，不进入 shared
- [x] 账号库材料首次使用时写入项目
- [x] accountCostSource 返回「账号屋面库」和「账号吊顶库」
- [x] vitest、lint、build 全部通过
