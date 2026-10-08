# 让复制/新建的项目可以修改墙体尺寸

## Context

用户反馈：从「三室两厅两卫 · 原木之家」复制出来的项目，选中墙体后「尺寸与位置」只显示「建筑结构已锁定，不能修改尺寸。」（实际是外围墙）

排查结论（已核实，行号对应当前 HEAD）：

- 唯一判定在 `src/features/interior/model/wallPolicy.ts:4`：
  `canEditWall = design.template === 'blank' && wall.kind === 'partition' && !isBearingWall(wall)`
- 复制有两条路径，都把 `state` 原样带过去，`template` 仍是 `reference`：
  - 项目列表「复制」：`cloud/useProjects.ts:552-563`（`create({ ...current, name })`）
  - 工作台「存到云端」：`pages/Index.tsx:23-24`（`{ ...projects.active, name }`）
- 即使是空白项目，也只有隔墙能改；外围墙/承重墙/矮墙一律锁定。
- 同一把锁连带管着：净距标注编辑（`dimensionWallEdit.ts:15,51`）、画布拖墙/拖端点（`PlanCanvas.tsx:452,473,873`）、删墙（`Workbench.tsx:342`）。

用户已确认：

1. 以后**新复制/新建**的项目结构可编辑；**已存在的项目保持锁定**（编辑现有项目需再复制一份）。
2. 解锁范围：**全部墙体尺寸**（含外围墙、承重墙），承重墙修改要给出风险提示。
3. 参考户型改墙后：房间边界跟着墙移动，**房间名称/材质/数量不变**；无法安全跟随则整次编辑拒绝。

## 方案

### 1. 显式解锁标记（不改 `template` 语义）

- `model/types.ts`：`Design` 增加 `structureUnlocked?: boolean`。旧数据没有该字段 = 维持原规则。
- `model/validation.ts`：该字段存在时必须是 boolean。
- 不把参考户型改成 `blank`：`rebuildRooms`（`geometry.ts:134`）开头就 `if (d.template !== 'blank') return d`，且对 `blank` 会按外框减隔墙重算房间，参考户型的手绘房间（飘窗凹口、外伸阳台）会被整体改写。

### 2. 拆分「可改尺寸」与「可删除」

`model/wallPolicy.ts`：

- `canEditWall` **保持原语义**（继续用于删墙、`PropertyPanel:439` 的「删除隔墙」按钮），避免顺带放开删外墙/承重墙。
- 新增：`canResizeWall(d, w) = canEditWall(d, w) || (d.structureUnlocked === true && d.template !== 'blank' && !d.demolished.includes(w.id))`
  —— `template !== 'blank'` 这一条是必须的：空白户型的房间由 `rect(0,0,width,depth)` 推导（`geometry.ts:141`），空白项目的外围墙尺寸只能走属性面板的 `净宽/净深/外围墙厚`（`PropertyPanel.tsx:513,540,551` 的 `resizeBlank`），单独放开会让房间和墙脱节。

改用 `canResizeWall` 的调用点（仅尺寸/位置）：

- `components/SelectionEditor.tsx:147`（`editableWall`，第 284 行锁定提示随之消失）
- `components/SizeFields.tsx:38`
- `components/PlanCanvas.tsx:452,473,873`
- `model/selectionEdits.ts:51`
- `model/dimensionWallEdit.ts:12`（`movable` 里改用 `canResizeWall`）、`dimensionWallEdit.ts:15` 改为「`template !== 'blank'` 且未解锁」才返回锁定原因、`dimensionWallEdit.ts:51` 同理

不改：`canDemolishWall`、`openingIsLocked`、`setWallBearing`（`wallPolicy.ts:9-16`）、画墙工具、`resizeBlank`、成本里按 `template` 计墙体施工的口径。

### 3. 参考户型的房间跟随

新增 `model/roomFollow.ts`：

- `followRooms(before, after): Design`：对每面 id 相同且几何变化的墙，把落在旧墙面（`wallPoly`，容差 0.05 m，与 `geometry.ts` 既有 epsilon 一致）上的房间顶点映射到新墙对应面：
  - 法向：贴旧墙哪一侧就贴新墙同侧（覆盖平移与墙厚变化）。
  - 轴向：按旧墙长度比例映射到新墙（覆盖端点伸缩，可用 `nearestOnWall().offset` 取比例）。
- 房间 `id/name/mat/wallMat/counted` 与顺序完全保留，只移动顶点；被删除的墙不牵动房间。
- 复用 `geometry.ts` 的 `wallPoly`、`length`、`ringArea`、`nearestOnWall`。
- 校验失败抛 `该调整会破坏房间划分`：任一环顶点数变化、环面积 ≤ 100 mm²、面积符号翻转、或环自交（用 `polygonClipping.intersection(ring, ring)` 面积比对，参照 `dimensionWallEdit.ts:20-22` 的写法）。
- 统一入口 `syncRooms(before, after) = after.template === 'blank' ? rebuildRooms(after) : followRooms(before, after)`。

接线（替换现有 `rebuildRooms` 调用）：

- `model/selectionEdits.ts:71`（尺寸输入路径，经 `sizeTransaction.ts:16` 预览）—— 抛错由 `sizeTransaction` 现有机制回滚。
- `components/PlanCanvas.tsx:318-323`（拖墙/拖端点 `finish`）—— try/catch；失败时 `preview(dr.before)` + `toast.error`，不写撤销记录。第 325 行的「房间划分已更新」提示只在 `rooms.length` 变化时出现，跟随模式下数量不变，自然不触发。
- `model/dimensionWallEdit.ts:107`（净距编辑）—— 该文件第 110 行还会用 `perimeterDimensions` 复核净距，若跟随结果导致复核失败会照旧抛错，属预期。

### 4. 解锁入口

- `data/templates.ts:314` `createProject`：产出的 `state` 带 `structureUnlocked: true`（`blankDesign()`/`referenceDesign()` 本身不变，既有测试夹具不受影响）。
- `cloud/useProjects.ts:558` 复制、`pages/Index.tsx:23-24` 云端副本：副本 `state` 加 `structureUnlocked: true`。
- `components/Workbench.tsx:484`「重置方案」：保留当前项目的 `structureUnlocked`，避免重置后重新上锁。
- 导入 JSON（`pages/Index.tsx:27`）：保留文件自身的值，不强改。

### 5. 文案与承重风险提示

- 旧项目锁定文案（`SelectionEditor.tsx:284-288`、`SizeFields.tsx:39`）：墙体分支改为「此项目创建时锁定结构尺寸，复制该项目后副本可自由调整。」门窗洞口锁定文案不变。
- 解锁项目中选中承重墙（`isBearingWall`）时，`SizeFields` 内常驻提示：「承重墙改动仅用于方案示意，实际施工须经结构专业评估。」
- 画布拖动承重墙、或净距编辑移动了承重墙并成功提交后，`toast.warning` 同一句提示。

## 关键文件

- `src/features/interior/model/wallPolicy.ts`（新增 `canResizeWall`）
- `src/features/interior/model/roomFollow.ts`（新增，含 `followRooms` / `syncRooms`）
- `src/features/interior/model/types.ts`、`model/validation.ts`（新字段）
- `src/features/interior/model/selectionEdits.ts`、`model/dimensionWallEdit.ts`（策略 + 房间同步）
- `src/features/interior/components/PlanCanvas.tsx`、`SizeFields.tsx`、`SelectionEditor.tsx`（策略接线与文案）
- `src/features/interior/data/templates.ts`、`cloud/useProjects.ts`、`pages/Index.tsx`、`components/Workbench.tsx`（解锁入口）

## Implementation checklist

- [x] `Design.structureUnlocked?: boolean` 已加入类型，`validateDesign` 拒绝非 boolean。
- [x] `canResizeWall` 已导出；未解锁设计、以及任何 `template === 'blank'` 的设计，结果与原 `canEditWall` 一致。
- [x] `canEditWall` 未改动；`Workbench.tsx:342` 删除墙仍限空白项目的非承重隔墙，`PropertyPanel.tsx:439` 删除按钮仍按 `canEditWall`。
- [x] 第 2 节列出的尺寸/拖拽/净距调用点全部改用 `canResizeWall`。
- [x] `followRooms` 覆盖平移、墙厚变化、端点伸缩三种情形，房间 id/name/mat/数量/顺序不变。
- [x] `followRooms` 在面积退化、面积翻转、自交、被压平（相邻三点共线）时抛错。
- [x] `syncRooms` 已接入 `selectionEdits`、`PlanCanvas.finish`、`dimensionWallEdit`；空白项目仍走 `rebuildRooms`。
- [x] `PlanCanvas.finish` 跟随失败时回滚预览、不提交、不弹「房间划分已更新」。
- [x] `createProject`、两条复制路径写入 `structureUnlocked: true`；重置方案保留该值；导入 JSON 不改文件自带值。
- [x] 旧项目锁定文案已更新；解锁项目的承重墙显示常驻风险提示，拖动/净距改动承重墙后弹出 warning。

## Verification checklist

- [x] 新增 `model/roomFollow.test.ts`：解锁的 `referenceDesign()` 平移一面隔墙、改一面外墙墙厚、伸缩一面墙端点 → 房间顶点跟随且元数据不变；把墙推到房间退化 → 抛错。
- [x] `model/wallPolicy.test.ts` 新增用例：`canResizeWall` 未解锁参考户型为 false；解锁后对外围/承重/矮/隔墙为 true，对已拆墙为 false；`template === 'blank'` 且未解锁时与 `canEditWall` 完全一致。
- [x] `selectionEdits` 新增用例：解锁参考户型改外墙长度成功；未解锁仍抛「此墙体的结构尺寸已锁定」。
- [x] `dimensionWallEdit` 新增用例：解锁参考户型的 `dimensionEditPolicy` 不再返回「参考户型的结构尺寸已锁定」；原有用例保持通过。
- [x] `validation` 新增用例：`structureUnlocked: 'yes'` 被拒绝；`true` 与缺省通过。
- [x] 本次相关测试全绿（排除 wallSplit* 后 53 个文件 / 332 条通过）；`pnpm test` 全量另有 5 条 wallSplit 失败，来自另一会话正在改的 `WallSplitDialog`/`wallSplitDraft`，与本次无关。
- [x] `pnpm check`（`eslint .` + `tsc --noEmit`）无错误。
- [x] `pnpm run build` 通过。
- [ ] 正向：新建参考户型项目，选外围墙改长度/墙厚即时生效，房间名称与地面跟随；选承重墙看到风险提示。
- [ ] 反向：打开现有复制项目仍显示新锁定文案且尺寸不可编辑；对它再「复制」一次，副本可编辑。
- [ ] 反向：空白项目的外围墙尺寸仍不可直接编辑（需走 `净宽/净深/外围墙厚`），房间划分行为不变。
- [ ] 反向：删除按钮对外围墙/承重墙仍不出现；承重墙门窗洞口锁定行为不变。
- [ ] 边界：墙厚 50/1000 mm、墙长 100 mm 上下限与越界输入的拒绝行为正确；墙尺寸修改可正常撤销/重做。
