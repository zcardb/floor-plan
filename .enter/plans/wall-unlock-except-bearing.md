# 墙体统一解锁：只有承重墙不可编辑

## 背景
截图里选中一面墙后，「尺寸与位置」弹窗显示「此项目创建时锁定了结构尺寸，复制该项目后副本可自由调整」。
根因在 `model/wallPolicy.ts` 的 `canResizeWall`：它按 `template`（空白 / 参考户型）和 `structureUnlocked`（复制或新建时才写入）来判断能否编辑，与承重无关：
- 旧项目 / 未带标记的项目：**所有墙**都锁定；
- 空白户型：外围墙始终锁定（房间靠 `width × depth` 外框推导）。

已确认的规则：
1. 任何项目（旧项目、参考户型、空白户型）的墙体一律可调尺寸、可移动、可拖拽；**不再提「复制后可自由调整」**。
2. **只有承重墙**（`isBearingWall`）不可编辑：尺寸、位置、拖拽、端点都禁用，并提示「取消承重标记后可编辑」。
3. 空白户型的外围墙也放开：房间改为**按实际墙体轮廓重算**，不再依赖外框矩形。

## 方案

### 1. 统一策略 `model/wallPolicy.ts`
- `canResizeWall(design, wall) = !isBearingWall(wall) && !design.demolished.includes(wall.id)`，不再看 `template` / `structureUnlocked`。
- 删除 `canEditWall`（唯一调用方是 PropertyPanel 的状态标签，改用 `canResizeWall`）。
- 新增文案常量 `BEARING_WALL_LOCKED = '承重墙的尺寸与位置已锁定，在「墙选项」中取消承重标记后可编辑'`。
- 以下调用方无需改代码即随之生效：`PlanCanvas`（拖墙 / 端点圆点）、`wallMove`（相连承重墙只当滑轨）、`structureBand`、`roomSides`、`dimensionWallEdit`、`selectionEdits`。

### 2. 删除旧的「项目级锁定」分支与文案
- `model/roomSides.ts`：删除 `locked` 分支与 `ROOM_STRUCTURE_LOCKED`；理由文案「两端都是固定结构（外围墙、承重墙或开敞边界）」→「两端都是承重墙或开敞边界」。
- `components/RoomSidesEditor.tsx`：删除 `locked` 横幅。
- `model/dimensionWallEdit.ts`：删除「参考户型的结构尺寸已锁定」那一行；「两侧均为固定结构」→「两侧均为承重墙或开敞边界」。
- `model/selectionEdits.ts`：报错改用 `BEARING_WALL_LOCKED`。
- `model/structureBand.ts`：
  - 「该移动会改变外墙或承重墙的连接端点」→「该移动会改变承重墙的连接端点」；
  - 删除「移动不能超出当前户型边界」（基于 `width/depth` 的边界会挡住外围墙外移；穿墙、重叠、连接等校验保留）。
- `model/wallMove.ts`：仅更新注释（不可调整的墙 = 承重墙）。

### 3. UI 提示（承重墙）
- `components/SizeFields.tsx`、`components/SelectionEditor.tsx`：锁定提示改为 `<LockKeyhole/> + BEARING_WALL_LOCKED`；SizeFields 中针对墙的承重风险提醒随之不再可达，删去墙那一半条件（门窗的承重提醒保留）。
- `components/PropertyPanel.tsx` 墙体属性：
  - 状态：承重墙「已锁定」，其余「可编辑」；
  - 说明：承重墙显示 `BEARING_WALL_LOCKED`，其余显示「拖动墙体移动，拖动两端圆点调整长度；封闭墙体会自动划分房间。」
- `PropertyPanel` 户型尺寸说明（参考户型）：去掉「锁定」字样 →「参考户型的外围尺寸请直接拖动或选中外围墙调整；层高仍可在此修改。」

### 4. 空白户型：房间按实际墙体轮廓重算
- `model/geometry.ts` 的 `rebuildRooms`（仍只作用于空白户型）：
  - 取所有未拆墙体的 `connectedWallPoly`，用其包围盒外扩 1 m 作外框，`difference(外框, 全部墙体)` 得到各区域；
  - 去掉包含外框角点（室外探针）的那块，剩下面积 > 10000 mm² 的即房间；
  - 沿用现有「按重叠面积继承旧房间 id / 名称 / 材质」逻辑。
  - 外围墙未动时结果与原来一致（外框墙内面正好是 `0..width × 0..depth`）。
- 新增 `blankFrameIntact(d)`：`outer-0..3` 都在、且几何与 `outerWalls(d.width, d.depth, d.thickness)` 一致。
  - `resizeBlank`：外框不完整时（被移动、改厚、分割、删除）统一拒绝，文案「外围墙已单独调整，当前不支持整体重设外围尺寸」；原「已分割 / 已删除」两条判断合并进来。
  - `PropertyPanel` 户型设置：空白户型外框不完整时禁用净宽 / 净深 / 外围墙厚，并显示上述说明；层高照常可改。
- `syncRooms`、`removeWall`、`useWallDrawing`、`PlanCanvas` 中现有的 `rebuildRooms` 调用不变，自动用上新算法。

### 5. `structureUnlocked` 标记退役
- 不再写入：`data/templates.ts`（新建）、`cloud/useProjects.ts`（复制，含注释）、`ai/apply.ts`、`model/externalDxf/recognize.ts`、`components/Workbench.tsx`（重置）。
- 保留：`types.ts` 字段（标为 `@deprecated`，仅为兼容已保存数据）、`validation.ts` 的类型校验、`templateState.ts` 指纹中的剔除。

## 关键文件
`model/wallPolicy.ts`、`model/geometry.ts`、`model/roomSides.ts`、`model/dimensionWallEdit.ts`、`model/structureBand.ts`、`model/selectionEdits.ts`、`components/SizeFields.tsx`、`components/SelectionEditor.tsx`、`components/PropertyPanel.tsx`、`components/RoomSidesEditor.tsx`（均在 `src/features/interior/` 下）。

## Implementation checklist
- [x] `canResizeWall` 只按「非承重 且 未拆除」判断；`canEditWall` 删除且无残留引用
- [x] 新增 `BEARING_WALL_LOCKED`，SizeFields / SelectionEditor / PropertyPanel / selectionEdits 统一使用
- [x] 全仓（非测试）不再出现「复制该项目」「此项目创建时锁定」「结构尺寸已锁定」「外围尺寸已锁定」
- [x] `roomSides` 去掉 `locked` 分支与 `ROOM_STRUCTURE_LOCKED`；RoomSidesEditor 去掉横幅
- [x] `dimensionWallEdit` 去掉参考户型锁定分支
- [x] `structureBand` 去掉户型边界校验，更新承重连接文案
- [x] PropertyPanel 墙体状态 / 说明按承重与否显示
- [x] `rebuildRooms` 改为按实际墙体轮廓求封闭区域，保留旧房间属性继承
- [x] `blankFrameIntact` + `resizeBlank` 统一拒绝；PropertyPanel 外框不完整时禁用三项尺寸
- [x] `structureUnlocked` 五处写入移除，类型标 `@deprecated`，校验与指纹剔除保留
- [x] 同步更新钉住旧行为的测试：`wallPolicy.test.ts`、`components/structureUnlock.test.tsx`、`roomSides.test.ts`、`dimensionWallEdit.test.ts`、`wallSplit.test.ts` / `wallRemoval.test.ts`（resizeBlank 新文案）、`ai.test.ts`、`useProjects.test.ts`、`templateState.test.ts` 中的相关断言

## Verification checklist
- [x] 正向：无 `structureUnlocked` 的旧参考户型，外围墙 / 隔墙 / 矮墙 `canResizeWall` 为真，`editSelection` 改长度成功
- [x] 正向：空白户型外围墙可移动（`moveWallWithJoints`）与改长度，向外移动后房间面积变大、房间 id 与名称不变
- [x] 正向：空白户型外围墙未动时，新 `rebuildRooms` 结果与原外框算法一致（房间数、面积）
- [x] 负向：承重墙（原始或手动标记）`canResizeWall` 为假，`editSelection` 抛 `BEARING_WALL_LOCKED`；取消标记后可编辑
- [x] 负向：拖动隔墙时，端点相连的承重墙不被拉伸（只当滑轨）
- [x] 边界：空白户型外围墙被移动 / 改厚 / 分割 / 删除后，`resizeBlank` 改尺寸抛新文案；参数不变时原样返回
- [x] 组件：选中旧项目的普通墙，尺寸弹窗显示输入框而非锁定文案；选中承重墙显示 `BEARING_WALL_LOCKED`
- [x] 承重墙上的门窗仍可编辑尺寸并显示承重提醒
- [x] `pnpm exec vitest run src/features/interior` 全部通过（基线中 `dimensionWallEdit.test.ts:87` 已有 1 个失败，与本次无关，单独说明）
- [x] `pnpm run lint` 与 `pnpm run build` 通过
