# 自定义地面材质

## 背景
现在选中房间时，“地面”下拉只有 8 种内置材质（`data/catalog.ts` 的 `materials`），新建家具弹窗里没有“地面”这一项。目标：在“新建你的家具”里新增分类 **地面**，按地面参数创建；创建后，选中任意房间/区域打开“材质 → 地面”时就能选到它，平面图、3D 和成本都按它显示和计算。

已确认的决定：
- 铺贴样式三种：**木地板纹**、**方砖**（含仿砖）、**整体浇筑/无缝**（无纹理，只有颜色）。
- 默认保存到当前项目，可勾选“同时添加到账号库”，其他项目可从账号库导入。
- 左侧“构件与家具”面板**不**新增地面分类，地面只出现在房间的地面材质选择里。
- 地面不走 AI 生成图片，不消耗额度。

## 数据模型
- `model/types.ts`：新增
  ```ts
  type FloorPattern = 'plank' | 'tile' | 'seamless';
  interface CustomFloor { key: string; name: string; pattern: FloorPattern; length?: number; width?: number; color: string; price: number | null }
  ```
  `Design.customFloors?: CustomFloor[]`；`key` 形如 `custom-<uuid>`，避免与内置 key 冲突。
- 新建 `model/floorMaterials.ts`（唯一入口，替代各处直接读 `materials[...]`）：
  - `floorMaterialsOf(d)` → 内置 + 项目自定义合并后的 `Record<string, FloorMaterialView>`（含 name/color/price/pattern/尺寸）。
  - `floorMaterialOf(d, key)` 单个查找；找不到时回退到内置 `wood`，防止旧数据崩溃。
  - 内置材质补上 pattern/尺寸映射（wood/walnut=plank，tile800/600/antislip=tile，marble/terrazzo/carpet 保持现有行为）。

## 实现
1. **新建弹窗**（`components/CustomFurnitureDialog.tsx`）
   - 分类下拉在现有分类后追加“地面”。
   - 选中“地面”时，表单切换为新组件 `components/CustomFloorFields.tsx`：名称、铺贴样式（木地板纹 / 方砖 / 整体浇筑）、单块长×宽 m（整体浇筑时隐藏）、颜色（复用现有调色板 Popover）、单价 元/m²。
   - 右侧预览改为纹理色块预览（复用下面的纹理绘制），隐藏 AI 生成提示；提交按钮直接保存。
   - 提交后回调新的 `onCreateFloor(floor)`；勾选账号库时写入账号地面库。
2. **项目保存**（`components/Workbench.tsx`）：新增 `saveCustomFloor`，按 key 去重追加到 `d.customFloors`，提示“地面已加入当前项目”。
3. **账号库**
   - 迁移：新建表 `interior_floor_catalog`（owner_id、floor_key、name、pattern、length、width、color、price、created_at，UNIQUE(owner_id, floor_key)），同一迁移内开启 RLS，策略仅本人可读写（照搬 `interior_furniture_catalog` 的写法）。不改动现有家具表。
   - 新建 `cloud/useFloorCatalog.ts`：load / save / remove。
   - 弹窗“账号家具库”标签页增加“地面”分组列表，点击导入到当前项目。
4. **选择入口改用合并后的材质**
   - `components/SelectionEditor.tsx` 房间材质“地面”下拉、价格信息。
   - `components/PropertyPanel.tsx` 材质卡片网格、房间列表色点、地面采购估算。
5. **渲染**
   - `components/Materials.tsx`：`MaterialDefs` 接收 design，为自定义地面生成 `mat-<key>` 图案（plank=木纹线、tile=按长×宽画缝、seamless=纯色）；`PlanCanvas.tsx` 传入 design。
   - `scene/Scene3D.tsx` 地面贴图按 pattern 绘制，而不是只判断 `wood/walnut`。
6. **成本与校验**
   - `model/costs.ts`：`priceOf` 的 floorPrices 及行名称改用 `floorMaterialOf`。
   - `components/CostItemVisual.tsx`、`components/MaterialProcurementEditor.tsx` 名称/颜色取合并材质。
   - `model/validation.ts`：校验 `customFloors`（key 格式、名称≤100、pattern 枚举、尺寸 50–20000mm、颜色 hex、价格合法）；房间 `mat` 和 `procurement` key 允许内置或项目自定义 key。
   - 删除自定义地面不在本次范围内。

## Implementation checklist
- [ ] `types.ts` 新增 `FloorPattern`、`CustomFloor`、`Design.customFloors`
- [ ] `model/floorMaterials.ts` 提供 `floorMaterialsOf` / `floorMaterialOf`，未知 key 回退不崩溃
- [ ] 新建弹窗分类含“地面”，选中后显示地面字段，整体浇筑隐藏尺寸
- [ ] 地面创建不调用 AI 生成
- [ ] `Workbench.saveCustomFloor` 写入 `customFloors` 并去重
- [ ] 迁移创建 `interior_floor_catalog`，同时开启 RLS + 本人策略
- [ ] `useFloorCatalog` 保存/读取；账号库标签页可导入地面
- [ ] SelectionEditor、PropertyPanel 的地面选项包含自定义地面
- [ ] 平面图 `MaterialDefs` 与 3D 地面按 pattern 渲染自定义地面
- [ ] costs / CostItemVisual / MaterialProcurementEditor 使用合并材质
- [ ] validation 接受自定义地面 key，拒绝非法 customFloors

## Verification checklist
- [ ] 单测：`floorMaterialsOf` 合并内置+自定义；未知 key 回退
- [ ] 单测：validation 接受合法 customFloors 与引用它的房间；拒绝非法 pattern/颜色/尺寸、引用不存在 key 的房间
- [ ] 单测：选“地面”分类时弹窗渲染铺贴样式字段，选“整体浇筑”时无尺寸输入
- [ ] 单测：房间使用自定义地面时 `priceOf`/成本行名称正确
- [ ] 不含 customFloors 的旧项目导入、渲染、成本结果不变
- [ ] 运行 `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build`
