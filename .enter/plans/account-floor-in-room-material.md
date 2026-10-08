# 房间「地面材质」直接显示账号地面库（修复「混凝土浇筑」不出现）

## Context / 原因
- 已查数据库：「混凝土浇筑」（整体浇筑，¥50/m²）保存在**账号地面库**（`interior_floor_catalog`），但你的 4 个项目（含当前 Home）的 `customFloors` 里都**没有**它。
- 现在的逻辑：房间材质选项只读取 `floorMaterialsOf(design)` = 内置 8 种 + **当前项目**的自定义地面。账号库里的地面必须先在「新建家具 / 账号库 → 账号家具库」页签里手动点一下「导入到项目」，才会出现在右侧选项里。之前说的“会出现在选项里”只对“在当前项目里新建”的地面成立，在账号管理页创建的就漏掉了。
- 修复目标：登录后，选中房间时，右侧「地面材质」和画布浮动条「材质 → 地面」下拉里，**直接列出账号地面库的所有地面**；点选即自动加入当前项目并应用到该房间（一次撤销即可还原）。

## 方案
1. **模型层（纯函数）** `src/features/interior/model/floorMaterials.ts`
   - 新增 `pickableFloors(d, accountFloors)`：返回 `{ key, material, fromAccount }[]`，先项目已有（内置 + customFloors），再追加账号库中**尚未在项目里**的地面（`fromAccount: true`），按 key 去重。
   - 新增 `applyRoomFloor(d, roomId, key, accountFloors)`：若 key 不在项目中但在账号库中 → 先追加到 `customFloors`，再设置 `room.mat = key`；返回新 design（单次 change，保证一次撤销）。未知 key 抛错。
2. **数据加载** `src/features/interior/components/Workbench.tsx`
   - 复用现有 `useFloorCatalog()`；`p.loggedIn` 为真时加载一次；`CustomFurnitureDialog` 关闭后（`customOpen` 变 false）重新加载，保证刚建的地面立即可选。未登录时传空数组。
   - 将 `accountFloors` 传给 `PropertyPanel` 与 `SelectionEditor`。
3. **右侧属性面板** `PropertyPanel.tsx` 的 `matGrid`
   - 改用 `pickableFloors` 渲染；账号库来源的卡片加一个小标签「账号库」，价格显示其自身单价（未定价显示「未定价」）。
   - 点击调用 `change(d => applyRoomFloor(...))`。
4. **画布浮动条** `SelectionEditor.tsx` 的「地面」`EditorSelect`
   - options 同样用 `pickableFloors`，账号库项 label 加后缀「· 账号库」；onChange 改用 `applyRoomFloor`。
5. 不改数据库结构、不改账号库/项目已有数据；内置材质与已导入地面行为不变。

## Implementation checklist
- [x] `floorMaterials.ts` 新增 `pickableFloors`，项目内已有的 key 不重复出现
- [x] `floorMaterials.ts` 新增 `applyRoomFloor`，账号地面首次选择时写入 `customFloors` 并设置房间 `mat`，已存在时只改 `mat`
- [x] `Workbench.tsx` 登录后加载账号地面，自定义家具弹窗关闭后刷新；未登录传 `[]`
- [x] `PropertyPanel.tsx` 地面材质网格显示账号库地面并带「账号库」标签，点击走 `applyRoomFloor`
- [x] `SelectionEditor.tsx` 「材质 → 地面」下拉包含账号库地面，选择走 `applyRoomFloor`

## Verification checklist
- [x] 单测：`pickableFloors` 对已导入 / 未导入 / 空账号库三种情况输出正确
- [x] 单测：`applyRoomFloor` 首次选择账号地面后 `customFloors` 含该地面且房间 `mat` 正确；再次选择不重复追加；未知 key 抛错
- [x] 单测：应用后的 design 通过 `validateDesign`（保存/重开不丢失）
- [ ] （待你实测）手动：选中「院子」，右侧出现「混凝土浇筑 · 账号库」，点击后房间变为浇筑效果，成本按 ¥50/m² 计算，撤销一次恢复原材质
- [x] 运行 `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build`
