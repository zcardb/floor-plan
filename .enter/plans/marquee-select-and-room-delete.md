# 长按圈选批量选家具 + 房间「删除房间」操作

## Context

2D 平面编辑现在只能单选一件家具（`Selection = {kind,id} | null`），搬运多件家具要一件件拖。
同时房间选中后的工具条只有一个「删除」，语义是「清空房间内家具」（`remove` → `clearRoomFurniture`），
没有真正的「删除房间」入口——用户希望的是：回车/Delete 仍然清空家具，下拉里再给一个「删除房间」，
删除时只拆掉这个房间自己的墙（不与其它房间共用的墙），公共墙保留。

两项需求：

1. **长按拖拽圈选家具**（类似截图框选）：在空白处按住鼠标稍作停顿后拖动，画出选框批量选中家具；
   选中后拖动其中任意一件，整批家具一起移动，相对位置不变。
2. **房间的两个删除操作**：清空房间家具（Delete / Backspace，保持现状）+ 删除房间（下拉菜单新增），
   删除房间 = 清除房内家具 + 删除该房间独立墙及墙上门窗（承重墙与共用墙保留并提示）。

## 现状（关键代码位置）

- `src/features/interior/components/PlanCanvas.tsx`
  - `onPointerDown`：空白处 `base.kind='pan'`；点家具 `base.kind='move'`；`data-fid` / `data-room` 判定。
  - `onPointerMove`：`dr.kind==='move'` 走 `stepDelta` + `snapFurniture` + `blockFurnitureMove`（单件）。
  - `onPointerUp` → `finish()`：`pan` 未移动时按 `data-room` 选房间，否则清空选择。
  - 选中态覆盖层在 `selection && (<g className="selection-overlay">…)`，家具用 `[data-handle="rot"|"size"]` 手柄。
- `src/features/interior/model/types.ts`：`Selection`、`Furniture`、`Room`、`Wall`。
- `src/features/interior/components/Workbench.tsx`
  - `remove()`（~L471）：`room` → `clearRoomFurniture`；`furniture/opening/wall` 分派。
  - `removeWall()`（~L449）：复用 `removeWallModel`，含承重保护与提示文案。
  - 键盘 `keydown`（~L503）：`delete/backspace` → `remove()`；`arrow*` 只移动单件家具。
- `src/features/interior/components/SelectionEditor.tsx`：浮层工具条，`p.remove` 标签为「清空房间家具」。
- `src/features/interior/model/`：`geometry.ts`（`wallPoly/bbox/inRoom/stepDelta`）、`wallRemoval.ts`（`removeWall` 已含
  `healSplitsAround` → `rebuildRooms` → `mergeRoomsAcrossWall` → `dropOpenRooms` → `dropOrphanFurniture` → `stripStrayHoles`）、
  `roomFurniture.ts`（`clearRoomFurniture`）、`roomRegions.ts`（`splitRoomsByWalls` 可参考判定房间与墙的关系）、
  `wallPolicy.ts`（`canDeleteWall`、`isBearingWall`）、`furnitureAlignment.ts`（`snapFurniture`）。

## 设计（已与用户确认）

- 「清除家具」快捷键保持 **Delete / Backspace**，下拉里新增 **删除房间**。
- 删除房间时，房间自己的外墙（只围这一间、另一侧是室外）**算独立墙一起删**；与其它房间共用的墙不动。
- 圈选命中规则：家具**四个角全部落在选框内**才选中。

### 1. 群组选择（最小改动方案）

`Selection` 增加一个变体，沿用「选择只有一个对象」的既有约束：

```ts
export type Selection = { kind: "furniture" | "room" | "wall" | "opening"; id: string }
  | { kind: "group"; ids: string[] } | null;
```

单件选择的现有代码全部不受影响（`s.kind==='furniture'` 分支不变）；只排查 `s.id` 在 `group` 下的可达性。

新增模型（纯函数，便于单测）：

- `src/features/interior/model/rectSelect.ts`
  - `normalizeRect(a, b)` → `{x1,y1,x2,y2}`；`furnitureCorners(f)` 复用与 `selectionPoints` 相同的旋转角点算法；
  - `furnitureInRect(design, rect)`：四角全部在框内的家具 id 列表（按 `design.furniture` 顺序）。
- `src/features/interior/model/furnitureGroup.ts`
  - `groupIds(d, selection)`：过滤掉已不存在的 id（选择失效时自动降级为空 / 单件）；
  - `groupBounds(d, ids)`：参与件的外接框（供工具条锚点与整体虚线框）；
  - `moveGroup(before, ids, delta)`：每件按 `stepDelta` 同一取整位移平移，保持相对位置（不做逐件靠墙吸附，
    否则整批相对关系会被破坏）。

### 2. PlanCanvas 长按圈选与群组拖动

- 新增 `Drag.kind = 'marquee'` 与 `'groupmove'`。
- `onPointerDown`（`tool==='select'`、非只读、空白处、单指、非右键）：起 `longPress` 计时器（350ms）；
  - 指针移动超过 5px 或出现第二指 → 取消计时器，照旧 `pan` / 双指缩放；
  - 计时器触发且指针仍按住 → `kind='marquee'`，记录世界坐标起点，`select(null)`；
  - 落在家具上（`data-fid`）：维持现有的单选 + `move`；若该家具属于当前 `group`，改为 `kind='groupmove'`
    （`id` 记起点件，`drag.ids` 记整组，`before` 记 `start` 时快照）。
- `onPointerMove`：`marquee` 只更新选框；`groupmove` 用 `moveGroup(dr.before, ids, stepDelta([dx,dy]))` `preview`。
- `onPointerUp`：
  - `marquee` → `furnitureInRect`：0 件 → 清空选择；1 件 → 单选；≥2 件 → `{kind:'group', ids}`；
  - `groupmove` 有位移 → `commit(d, dr.before)`（可撤销）+ 顶部提示「已移动 N 件家具」；
  - `pan` 的既有语义（未移动时按 `data-room` 选房间）保持不变。
- `onPointerCancel` / `finish(true)` 必须清掉 `longPress` 计时器，避免拖动中途留下定时器。
- 覆盖层：
  - `marquee` 进行中画 `var(--plan-selection-soft)` 填充 + `var(--plan-selection)` 虚线的选框；
  - `group`：每件虚线框（复用单件家具的同一个 `<rect>` 样式）+ 整体外框；
  - `selectionPoints` 增加 `group` 分支（用 `groupBounds` 的四角），`SelectionEditor` 自动定位到整组；
  - `<svg>` class 增加 `tool-marquee`（或复用 `tool-select`），必要时在 `src/index.css` 补样式。

### 3. Workbench / SelectionEditor / 其它 Selection 消费者

- `Workbench`：`remove()` 增加 `group` 分支（批量删除选中家具，一次 `change`，一条提示）；
  `arrow*` 键在有 `group` 选择时整组按步进移动；`Ctrl+D` / `R` 等单件动作对 `group` 不生效；
  切到 3D（`toggleView`）时清空 `group` 选择（3D 只有单件选中语义）。
- `SelectionEditor`：`selection.kind==='group'` 时——
  - 名称显示「已选中 N 件家具」；只保留「删除」（`aria-label="删除选中家具"`）与「取消选择」，
    尺寸 / 颜色 / 单价 / 旋转 / 复制对整组隐藏（保持简单，不做批量改属性）；
  - 房间选中时新增「删除房间」入口（下拉，见下）。
- `scene/Scene3D.tsx`、`model/costBreakdown.ts`、`components/PropertyPanel.tsx`：`selection?.kind === 'furniture'`
  的判定天然排除 `group`，只需按 TS 报错补齐分支（PropertyPanel 对 `group` 走「未选中」的概览态）。

### 4. 房间删除

- 新增 `src/features/interior/model/roomRemoval.ts`：
  - `roomOwnWalls(d, roomId): string[]`：把房间轮廓每条边的墙带（按房间外法向在墙两侧各取几个采样点，
    用 `inRoom` 判定相邻房间）归到该房间；**只由这一间房间围出的墙**才算「独立墙」，两侧都有房间的墙视为共用墙；
  - `removeRoom(d, roomId)`：
    1. `roomOwnWalls` 得到候选墙，过滤 `canDeleteWall`（承重墙 / 最后一堵墙保留）；
    2. 逐面套用 `removeWall` 的既有流水线（`healSplitsAround` → `rebuildRooms` → `mergeRoomsAcrossWall` →
       `dropOpenRooms` → `dropOrphanFurniture` → `stripStrayHoles`），每步后按新 id 重算（愈合可能合并墙段）；
    3. `clearRoomFurniture` 清掉该房间里的家具；
    4. 结果里仍存在该房间（说明还有墙围住它）→ 抛错「这个房间四周都是共用墙或承重墙，请先删除其中一面墙」；
    5. 返回 `{ design, removedWalls, keptWalls, furniture }` 供调用方提示。
- `Workbench.removeRoom(roomId)`：`commit(next, before)`，提示区分三种情况
  （已拆除 N 面独立墙、保留 M 面共用 / 承重墙、清理 K 件家具），失败走 `notify.fail`。
- `SelectionEditor` 房间工具条：把原来的单一「删除」按钮改为下拉
  （`DropdownMenu`，参考 `WallOptionsMenu.tsx` 的条目样式）：
  - 「清空房间家具」——`aria-label` 与提示标注 `Delete`，调用 `p.remove`（不变）；
  - 「删除房间」——危险项，说明「只删除本房间独立墙，共用墙与承重墙保留」，调用新的 `p.removeRoom`，
    执行前用 `useConfirm` 二次确认（与 `clearSplits` 等危险操作一致）。
- `Workbench` 把 `removeRoom` 透传给 `SelectionEditor`（只在 2D 选择模式可用）。

## 需要修改 / 新增的文件

- 新增：`src/features/interior/model/rectSelect.ts`(+`.test.ts`)、`model/furnitureGroup.ts`(+`.test.ts`)、
  `model/roomRemoval.ts`(+`.test.ts`)
- 修改：`model/types.ts`（`Selection` 增加 `group`）、`components/PlanCanvas.tsx`、
  `components/Workbench.tsx`、`components/SelectionEditor.tsx`、`model/selectionAnchor.ts`（`group` 分支）、
  按需 `scene/Scene3D.tsx` / `components/PropertyPanel.tsx` / `model/costBreakdown.ts` 的类型分支、`src/index.css`（选框样式）

## Implementation checklist

- [ ] `types.ts` 的 `Selection` 增加 `{ kind: 'group'; ids: string[] }`，仓库内所有 `s.id` 访问点按 TS 报错补齐分支
- [ ] `rectSelect.ts`：`furnitureInRect` 按「四角全部在框内」返回 id，`normalizeRect` 支持任意方向的拖拽
- [ ] `furnitureGroup.ts`：`groupIds` 过滤失效 id、`groupBounds` 返回整组外接框、`moveGroup` 用同一步进取整位移平移
- [ ] `PlanCanvas` 空白处长按（350ms）后进入 `marquee`，移动取消 / 双指取消长按，选框实时渲染
- [ ] `PlanCanvas` 圈选松开：0 件清空选择、1 件单选、≥2 件 `{kind:'group'}`；`pointercancel`/`cancel` 清掉计时器
- [ ] `PlanCanvas` 拖动组内任一家具走 `groupmove`，整组按同一位移 `preview`，松手 `commit` 可撤销
- [ ] 覆盖层渲染 `marquee` 选框与 `group` 的逐件虚线框 + 整组外框；`selectionPoints` 支持 `group`
- [ ] `Workbench.remove()` 支持 `group` 批量删除；方向键在有 `group` 时整组移动；切 3D 时清空 `group`
- [ ] `SelectionEditor` 在 `group` 下只显示「已选中 N 件家具」+ 删除 + 取消选择
- [ ] `roomRemoval.roomOwnWalls` 只把「单独围出该房间」的墙判为独立墙，两侧都有房间的墙判为共用墙
- [ ] `roomRemoval.removeRoom` 逐面复用 `removeWall` 的愈合 / 并房 / 清理流水线，并清除房内家具
- [ ] `removeRoom` 在房间仍被围合（共用墙 / 承重墙）时抛错，不产生半拆状态（提交前完成全部校验）
- [ ] `SelectionEditor` 房间工具条改为下拉：「清空房间家具（Delete）」+ 二次确认的「删除房间」，`Workbench` 透传 `removeRoom`

## Verification checklist

- [ ] `pnpm test`（vitest）：新增 `rectSelect.test.ts`（全含选中 / 一角在外不选 / 空框）、
      `furnitureGroup.test.ts`（整组相对位置不变、失效 id 过滤、单件降级）、`roomRemoval.test.ts`
      （只删独立墙、共用墙保留、外墙一并删除、固定户型删后房间数 -1、承重墙围合时抛错）
- [ ] `pnpm lint`、`pnpm run build` 通过（`pnpm exec tsc --noEmit` 确认 `Selection` 新变体无遗漏分支）
- [ ] 手工验证 2D（`pnpm dev`，桌面 1280 宽）：
  - 空白处按下不动 350ms 再拖出矩形 → 框内家具整组选中，可见选框；松手不动（未拖出）仍只清空选择；
  - 点中组内一件拖动 → 整组同位移，位置关系不变；Delete 删除整组，Ctrl+Z 可撤销；
  - 单选家具的移动 / 吸附 / 靠墙阻挡行为与改动前一致；
  - 参考户型与空白户型各删一个房间：独立墙与墙上门窗消失、共用墙保留、相邻房间仍在、房内家具被清空、
    顶栏提示数量正确、Ctrl+Z 可撤销；对「四周都是共用墙」的房间给出明确失败提示而不是拆一半；
  - 选中房间时下拉可见两项，Delete 仍只清空家具、不改动墙体。
- [ ] 移动端宽度（≤1100）下选框与工具条不与抽屉冲突（长按拖动的既有 pan 手势仍可用）
