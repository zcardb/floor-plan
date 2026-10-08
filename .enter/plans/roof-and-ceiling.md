# 屋面与吊顶：并入硬装体系

## Context
家居管理的硬装目前只有「地面 / 墙面 / 门窗」。为了支持自建房、别墅，新增两类：
- **屋面**：整栋房子一个，支持平顶 / 单坡 / 双坡 / 四坡，可以设坡度和出檐，算出斜面面积，作为**全屋公共项**计价。
- **吊顶**：每个房间单独设置，按房间面积计价，归到**该房间**名下。

「物理」这里按「屋顶」理解：屋面是建筑整体属性，所以放在项目参数里，和层高、外墙厚放在一起，不放到某个房间下面。吊顶属于房间材质，和地面、墙面一起选。

**3D 显示**：酷家乐、三维家、SketchUp、Revit、Sweet Home 3D 都能在 3D 里看到屋顶，所以我们也在 3D 里画出来，并在 3D 工具栏加一个「屋顶」开关，可以隐藏。**DXF / SVG / PDF 平面图不导出屋顶和吊顶**（平面导出使用的 `drawingDocument` 不读这两个字段）。

## 数据模型（定义处）
`model/types.ts`
```ts
export type RoofType = 'flat' | 'shed' | 'gable' | 'hip';   // 平顶/单坡/双坡/四坡
export interface Roof { type: RoofType; slope: number; eave: number; mat: string } // slope°: 平顶为0，坡顶5–60；eave mm 0–1500
export type CustomRoof = CustomWall; export type CustomCeiling = CustomWall;        // 名称+颜色+单价/m²，结构与墙面相同
Room.ceilingMat?: string        // 不填表示原顶，不计吊顶
Design.roof?: Roof              // 不填表示无屋面（公寓、旧项目都是这样）
Design.customRoofs? / customCeilings?
CostSettings.roofPrices? / ceilingPrices?
```
`model/hardMaterials.ts`
- `HARD_CATEGORIES = ['地面','墙面','门窗','屋面','吊顶']`，并新增 `ROOF_CATEGORY` 和 `CEILING_CATEGORY`
- 内置屋面材料（只作参考，不带默认单价，和墙面一致）：琉璃瓦、水泥瓦、沥青瓦、树脂瓦、石板瓦、现浇混凝土平屋面（含防水保温）、彩钢瓦、阳光板
- 内置吊顶材料：石膏板吊顶、铝扣板吊顶、集成吊顶
- 参照墙面的写法，新增 `roofMaterialOf / pickableRoofs / applyRoof`，以及 `ceilingMaterialOf / pickableCeilings / applyRoomCeiling`。账号库里的材料第一次使用时会写入项目，撤销一次就能还原
- 新文件 `model/roof.ts`：
  - `roofFootprint(d)`：取未拆除墙体的包围盒，每边向外扩半个墙厚，再加出檐
  - `roofArea(d)`：平顶取投影面积；坡顶为投影面积 ÷ cos(坡度)，同坡度的单坡、双坡、四坡都适用这个公式

## 用到的地方（消费处）
1. **项目参数**：新增 `components/RoofSettings.tsx`，放在 `PropertyPanel` 的 `DimensionSettings` 后面。包括：启用开关、类型、坡度（平顶时禁用）、出檐、屋面材料（含账号库），并显示「投影面积 / 屋面面积」。
2. **房间材质弹层**：在 `SelectionEditor` 的「地面 / 墙面」下面加一个「吊顶」下拉框，第一项是「原顶（无吊顶）」。
3. **成本计算**：
   - `costs.ts`：`PriceGroup` 加上 `roofPrices` 和 `ceilingPrices`；`priceOf` 读取自定义材料的价格；`calculateCosts` 加上屋面行（面积取 `roofArea`）和吊顶行（只算 `counted` 房间的面积）
   - `costBreakdown.ts`：屋面放进 `shared`，备注「全屋屋面 · 坡度换算」；吊顶按房间计入 `hard`
   - `CostCategoryList`：加「屋面：投影 ÷ cos 坡度」和「吊顶：按房间面积」两类
   - `costDefaults.priceGroups`：加入两个新分组
4. **账号家具库**：
   - `accountCostEntries`：加上屋面和吊顶条目，来源分别显示为「账号屋面库」「账号吊顶库」
   - `CostItemVisual`：用 lucide 图标（`Home` / `PanelTop`）
   - `AccountCMS`：加载两个新的账号库
5. **新建弹窗**：把 `CustomWallForm` 抽成通用的 `CustomColorMaterialForm`，用名称、提示文字和图标区分，墙面、屋面、吊顶共用；`CustomFurnitureDialog` 的分类和账号库面板也加上屋面和吊顶。
6. **账号库存储**：把 `useWallCatalog` 抽成通用的 `useColorMaterialCatalog(table)`，墙面、屋面、吊顶三种都用它。新建 `interior_roof_catalog` 和 `interior_ceiling_catalog` 两张表，结构参照 `interior_wall_catalog`，同时开启行级权限，只有本人可读写。**现有的表不做任何改动。**
7. **校验**：`validation.ts` 校验 `roof` 的类型、坡度、出檐范围，以及 `ceilingMat`、`customRoofs`、`customCeilings` 和两个新价格分组。材料 key 不存在时回退到默认材料。
8. **3D**（`scene/Scene3D.tsx` 和 `Workbench.tsx`）：
   - `SceneOptions` 加一个 `roof: boolean`，默认 `true`。3D 工具栏在「剖切」旁边加「屋顶」开关
   - 屋顶放在单独的 `roof` 组里，不参与点选。只有 `design.roof` 存在、开关打开、并且不在剖切模式时才显示
   - 几何：平顶是一块薄板；单坡是一个斜面；双坡是两个斜面加两侧山墙三角，屋脊沿长边；四坡是四个斜面。颜色取屋面材料的颜色
   - 吊顶：只在漫游模式下，在层高处给有吊顶的房间画顶面
9. **导出**：`drawingDocument`、`svgExport`、`dxfExport` 不改。另外加测试，确认导出结果里没有屋面或吊顶内容。

## Implementation checklist
- [ ] 在 `types.ts` 中加入 `Roof`、`RoofType`、`Room.ceilingMat`、`Design.roof/customRoofs/customCeilings`，以及 `roofPrices/ceilingPrices`
- [ ] 在 `hardMaterials.ts` 中加入两个分类常量、8 种内置屋面、3 种内置吊顶，以及 `*MaterialOf / pickable* / applyRoof / applyRoomCeiling`
- [ ] 新增 `model/roof.ts`，实现 `roofFootprint` 和 `roofArea`
- [ ] `costs.ts`：完成新 PriceGroup、`priceOf` 分支，以及 `calculateCosts` 中的屋面行和吊顶行
- [ ] `costBreakdown.ts`：屋面放入公共项，吊顶按房间计
- [ ] `costDefaults.priceGroups` 和 `CostCategoryList` 加上两个新分类
- [ ] `validation.ts`：完成 roof、ceilingMat、自定义列表和价格分组的校验
- [ ] 迁移：新建两张账号库表并配置 owner-only RLS
- [ ] 抽出通用的 `useColorMaterialCatalog`，`useWallCatalog` 改为调用它
- [ ] 抽出通用的 `CustomColorMaterialForm`，墙面、屋面、吊顶三处接入
- [ ] `CustomFurnitureDialog`、`AccountCMS`、`AccountFurnitureLibrary`、`accountCostEntries`、`CostItemVisual` 接入屋面和吊顶
- [ ] 新增 `RoofSettings.tsx` 并放进 `PropertyPanel`
- [ ] `SelectionEditor` 房间材质里加入「吊顶」下拉框，包含「原顶」
- [ ] `Workbench` 加载账号屋面和吊顶库，并加上 3D「屋顶」开关
- [ ] `Scene3D` 实现四种屋顶几何、开关和剖切时隐藏、漫游时显示吊顶

## Verification checklist
- [ ] 单元测试：10×8 m、出檐 0.5 m、双坡 30° 的屋面面积等于 (11×9)/cos30°；平顶面积等于投影面积
- [ ] 单元测试：坡度 0 和 60 两个边界值可以通过；坡度 61 或负数出檐会被校验修正
- [ ] 单元测试：没有 `roof` 的旧项目，成本里不出现屋面行；房间没有 `ceilingMat` 时，不出现吊顶行
- [ ] 单元测试：吊顶在房间明细里归属正确；屋面出现在公共项里；两边合计等于全屋合计
- [ ] 单元测试：使用账号库的屋面后会写入 `customRoofs`，撤销一次即可还原
- [ ] 单元测试：有屋面和吊顶时，SVG 和 DXF 输出里不含屋面或吊顶材料名
- [ ] 单元测试：`accountCostSource` 返回「账号屋面库」和「账号吊顶库」
- [ ] 手动检查 3D：四种屋顶都能正常显示；开关能隐藏屋顶；剖切时自动隐藏；吊顶只在漫游时出现
- [ ] 运行 `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build`，全部通过
