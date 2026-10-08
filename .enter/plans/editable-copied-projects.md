# 让复制/新建的项目可以修改墙体尺寸

## Context

用户反馈：从「三室两厅两卫 · 原木之家」复制出来的项目，选中墙体后「尺寸与位置」只显示「建筑结构已锁定，不能修改尺寸。」

排查结论：

- 唯一判定在 `src/features/interior/model/wallPolicy.ts:4`：
  `canEditWall = design.template === 'blank' && wall.kind === 'partition' && !isBearingWall(wall)`
- 复制有两条路径，都把 `state` 原样带过去，`template` 仍是 `reference`：
  - 项目列表「复制」：`cloud/useProjects.ts:519`
  - 工作台「存到云端」：`pages/Index.tsx:22`
- 即使是空白项目，也只有隔墙能改；外围墙/承重墙/矮墙一律锁定（截图选中的是外围墙）。
- 同一把锁还管着：净距标注编辑（`dimensionWallEdit.ts:15`）、画布拖墙/拖端点（`PlanCanvas.tsx:448,469,869`）、删墙（`Workbench.tsx:333`）。

用户已确认：

1. 以后**新复制/新建**的项目结构可编辑；**已存在的项目保持锁定**（想编辑现有项目，再复制一份即可得到可编辑副本）。
2. 解锁范围：**全部墙体尺寸**（含外围墙、承重墙），承重墙修改要给出风险提示。
3. 参考户型改墙后：房间边界跟着墙移动，**房间名称/材质/数量不变**；无法安全跟随则整次编辑拒绝。

## 方案

### 1. 显式解锁标记（不改 `template` 语义）

- `model/types.ts`：`Design` 增加 `structureUnlocked?: boolean`。旧数据没有该字段 = 维持原规则。
- `model/validation.ts`：该字段存在时必须是 boolean。
- 不把参考户型改成 `blank`：`rebuildRooms`（`geometry.ts:134`）对 `blank` 会按外框减隔墙重算房间，参考户型的手绘房间（飘窗凹口、外伸阳台）会被整体改写。

### 2. 拆分「可改尺寸」与「可删除」

`model/wallPolicy.ts`：

- `canEditWall` **保持原语义**（继续用于删除墙、删除按钮、`PropertyPanel` 的「删除隔墙」），避免顺带放开删外墙/承重墙。
- 新增 `canResizeWall(d, w) = canEditWall(d, w) || (d.structureUnlocked === true && !d.demolished.includes(w.id))`。

改用 `canResizeWall` 的调用点（只涉及尺寸/位置）：

- `components/SelectionEditor.tsx:148,271`（尺寸弹层锁定判断；第 403 行删除按钮仍用 `canEditWall`）
- `components/SizeFields.tsx:38`
- `components/PlanCanvas.tsx:448,469,869`（拖端点、拖墙、端点手柄渲染）
- `model/selectionEdits.ts:51`
- `model/dimensionWallEdit.ts:12,15,51`（第 15 行改为：`template !== 'blank'` 且未解锁时才返回锁定原因）

不改：`canDemolishWall`、`openingIsLocked`、`setWallBearing`、画墙工具（`PlanCanvas.tsx:404`）、`resizeBlank`、成本里按 `template` 计墙体施工的口径（`costs.ts:240`、`costBreakdown.ts:260`）。

### 3. 参考户型的房间跟随

新增 `model/roomFollow.ts`：

- `followRooms(before, after): Design` —— 对每面 id 相同但几何变化的墙，把落在旧墙面（`wallPoly`，容差 1 mm）上的房间顶点映射到新墙对应面：
  - 法向分量：贴着哪一侧墙面就贴到新墙同侧墙面（覆盖平移、墙厚变化）。
  - 轴向分量：按旧墙长度比例映射到新墙（覆盖端点伸缩）。
- 房间 `id/name/mat/wallMat/counted` 和顺序完全保留，只移动顶点；被删除的墙不影响房间。
- 校验失败（环面积 ≤ 0.01 m²、面积符号翻转、环自交）抛 `该调整会破坏房间划分`。
- 复用 `geometry.ts` 的 `wallPoly`、`length`、`ringArea`、`nearestOnWall`。
- 统一入口 `syncRooms(before, after) = after.template === 'blank' ? rebuildRooms(after) : followRooms(before, after)`。

接线（替换现有的 `rebuildRooms` 调用）：

- `model/selectionEdits.ts:71`（尺寸输入）—— 抛错由 `sizeTransaction` 现有机制回滚预览。
- `components/PlanCanvas.tsx:318`（拖墙/拖端点结束）—— try/catch，失败时 `preview(dr.before)` 并 `toast.error`，不提交。
- `model/dimensionWallEdit.ts:107`（净距编辑）。

### 4. 解锁入口

- `data/templates.ts` `createProject`：两种模板产出的 `state` 都带 `structureUnlocked: true`（`blankDesign()`/`referenceDesign()` 本身不变，现有测试夹具不受影响）。
- `cloud/useProjects.ts:519` 与 `pages/Index.tsx:22`：副本 `state` 加 `structureUnlocked: true`。
- `components/Workbench.tsx:456`「重置方案」：保留当前项目的 `structureUnlocked`，避免重置后重新上锁。
- 导入 JSON（`Index.tsx:25`）：保留文件自身的值，不强改。

### 5. 文案与承重风险提示

- 旧项目锁定文案（`SelectionEditor.tsx:274`、`SizeFields.tsx:39` 的墙体分支）：改为「此项目创建于结构锁定版本，墙体尺寸不可修改。复制该项目后，副本可自由调整。」门窗洞口锁定文案不变。
- 解锁项目中选中承重墙（`isBearingWall`）时，`SizeFields` 输入框上方常驻提示：「承重墙改动仅用于方案示意，实际施工须经结构专业评估。」
- 画布拖动承重墙、或净距编辑移动了承重墙并成功提交后，`toast.warning` 同一句提示。

## Implementation checklist

- [ ] `Design.structureUnlocked?: boolean` 已加入类型，`validateDesign` 拒绝非 boolean 值。
- [ ] `canResizeWall` 已导出；未解锁设计结果与原 `canEditWall` 完全一致。
- [ ] `canEditWall` 未改动，删除墙仍仅限空白项目的非承重隔墙。
- [ ] 第 2 节列出的尺寸/拖拽/净距调用点全部改用 `canResizeWall`，删除相关调用点未改。
- [ ] `followRooms` 支持平移、墙厚变化、端点伸缩，房间 id/name/mat/数量/顺序不变。
- [ ] `followRooms` 在房间退化/翻转/自交时抛错。
- [ ] `syncRooms` 接入 `selectionEdits`、`PlanCanvas` 拖墙结束、`dimensionWallEdit`；空白项目仍走 `rebuildRooms`。
- [ ] `PlanCanvas` 拖墙失败时回滚预览且不提交撤销记录。
- [ ] `createProject`、两条复制路径都写入 `structureUnlocked: true`；重置方案保留该值。
- [ ] 旧项目锁定文案已更新；解锁项目的承重墙显示风险提示，拖动/净距修改承重墙后弹出 warning。

## Verification checklist

- [ ] 新增 `model/roomFollow.test.ts`：对解锁的 `referenceDesign()` 平移一面隔墙、改一面外墙墙厚、伸缩一面墙端点，断言相邻房间顶点跟随且房间元数据不变；把墙推到让房间退化时断言抛错。
- [ ] 新增 `model/wallPolicy.test.ts` 用例：`canResizeWall` 在未解锁参考户型返回 false，解锁后对外围/承重/矮/隔墙均返回 true，对已拆墙返回 false；`canEditWall` 结果不变。
- [ ] 新增 `selectionEdits` 用例：解锁参考户型改外墙长度成功；未解锁时仍抛「锁定」。
- [ ] 新增 `dimensionWallEdit` 用例：解锁参考户型的 `dimensionEditPolicy` 不再返回「参考户型」原因；未解锁的原用例保持通过。
- [ ] 新增 `validation` 用例：`structureUnlocked: 'yes'` 被拒绝，`true`/缺省通过。
- [ ] `pnpm test`（范围 `src/features/interior`）全绿；使用 `createProject('reference')` 的既有测试若断言锁定则按新口径调整。
- [ ] `pnpm check`（eslint + `tsc --noEmit`）无错误。
- [ ] `pnpm run build` 通过。
- [ ] 手动：新建参考户型项目，选外围墙改长度/墙厚即时生效，房间名称与地面跟随；选承重墙看到风险提示。
- [ ] 手动：打开现有复制项目仍显示新锁定文案；对它再「复制」一次，副本可编辑。
- [ ] 手动：删除按钮对外围墙/承重墙仍不出现；撤销/重做对墙尺寸修改正常。
