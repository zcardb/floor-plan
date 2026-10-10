# 框选批量选家具 + 房间「删除房间」操作

## Context

2D 平面编辑现在只能单选一件家具（`Selection = {kind,id} | null`），搬运多件家具要一件件拖。
同时房间选中后的工具条只有一个「删除」，语义是「清空房间内家具」（`remove` → `clearRoomFurniture`），
没有真正的「删除房间」入口——用户希望的是：回车/Delete 仍然清空家具，下拉里再给一个「删除房间」，
删除时只拆掉这个房间自己的墙（不与其它房间共用的墙），公共墙保留。

两项需求：

1. **框选家具**（类似截图框选）：2D 工具栏新增「框选」开关；开启后在空白处左键拖动画出选框，批量选中家具；
   关闭时左键拖动仍是平移画布（不占用现有平移手势）。选中后拖动其中任意一件，整批家具一起移动，相对位置不变。
2. **房间的两个删除操作**：清空房间家具（Delete / Backspace，保持现状）+ 删除房间（下拉菜单新增），
   删除房间 = 清除房内家具 + 删除该房间独立墙及墙上门窗（承重墙与共用墙保留并提示）。
3. **顶部工具栏顺序调整**：「撤销 / 重做」挪到「重置方案 / 清空」的右边。

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

- 圈选与平移用 **工具栏「框选」开关** 区分：开关关闭 = 现状（左键拖空白处平移）；开关开启 = 左键拖空白处圈选。
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

### 2. 「框选」开关 + PlanCanvas 圈选与群组拖动

- `Workbench` 新增状态 `marquee: boolean`（默认关），在 2D 工具组「选择」按钮右侧加 `ToolButton`
  「框选」（lucide `SquareDashedMousePointer` 图标，快捷键 `M`，`active={marquee}`），点击切换；
  点「绘墙 / 门 / 窗」或切到 3D 时自动关闭；只读预览不显示。
  通过新 prop `marquee` 传给 `PlanCanvas`，仅在 `tool==='select'` 时生效。
- 新增 `Drag.kind = 'marquee'` 与 `'groupmove'`。
- `onPointerDown`（`tool==='select'`、非只读、单指、左键）：
  - `marquee` 开启且按在空白 / 房间上（非家具、墙、门窗、手柄）→ `kind='marquee'`，记录世界坐标起点；
  - `marquee` 关闭 → 维持现状 `pan`（不受任何影响）；
  - 落在家具上（`data-fid`）：维持现有的单选 + `move`；若该家具属于当前 `group`，改为 `kind='groupmove'`
    （`id` 记起点件，`drag.ids` 记整组，`before` 记按下时快照）——与开关状态无关，关闭开关后整组仍可拖动；
  - 双指手势、滚轮缩放在框选模式下照常可用；框选模式下点空白未拖动（<5px）= 现有「选房间 / 取消选择」。
- `onPointerMove`：`marquee` 只更新选框；`groupmove` 用 `moveGroup(dr.before, ids, stepDelta([dx,dy]))` `preview`。
- `onPointerUp`：
  - `marquee` → `furnitureInRect`：0 件 → 清空选择；1 件 → 单选；≥2 件 → `{kind:'group', ids}`；
  - `groupmove` 有位移 → `commit(d, dr.before)`（可撤销）+ 顶部提示「已移动 N 件家具」；
  - `pan` 的既有语义（未移动时按 `data-room` 选房间）保持不变。
- `onPointerCancel` / `finish(true)` 清掉进行中的选框。
- `<svg>` class 在开关开启时追加 `marquee-on`，`src/index.css` 中把光标设为十字（`crosshair`），提示当前是框选模式；
  状态栏 `tip` 在开关开启时显示「拖动框选家具 · 拖动选中的家具可整组移动 · M 关闭框选」。
- 覆盖层：
  - `marquee` 进行中画 `var(--plan-selection-soft)` 填充 + `var(--plan-selection)` 虚线的选框；
  - `group`：每件虚线框（复用单件家具的同一个 `<rect>` 样式）+ 整体外框；
  - `selectionPoints` 增加 `group` 分支（用 `groupBounds` 的四角），`SelectionEditor` 自动定位到整组；


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

### 5. 工具栏顺序（撤销 / 重做 移到 重置方案 / 清空 右侧）

- `Workbench.tsx` 工具栏（~L853–896）当前顺序：`选择/绘墙/门/窗` | `撤销 重做` | `重置方案 清空▾`。
- 调整为：`选择/框选/绘墙/门/窗` | `重置方案 清空▾`（`tool-group danger-actions`）| `撤销 重做`（`tool-group`），
  只移动两个 JSX 块与中间的 `toolbar-divider`，按钮本身、快捷键、禁用逻辑不变。
- 窄屏（≤600px）`danger-actions` 本就隐藏：调整后保证不出现两条相邻分隔线
  （给 `danger-actions` 前的分隔线也加同样的隐藏规则，或把分隔线放进 `danger-actions` 组内）。
- `Workbench.test.tsx` 中按 `className === 'tool-group danger-actions'` 查找的测试不受顺序影响，保持通过。

## 需要修改 / 新增的文件

- 新增：`src/features/interior/model/rectSelect.ts`(+`.test.ts`)、`model/furnitureGroup.ts`(+`.test.ts`)、
  `model/roomRemoval.ts`(+`.test.ts`)
- 修改：`model/types.ts`（`Selection` 增加 `group`）、`components/PlanCanvas.tsx`、
  `components/Workbench.tsx`、`components/SelectionEditor.tsx`、`model/selectionAnchor.ts`（`group` 分支）、
  按需 `scene/Scene3D.tsx` / `components/PropertyPanel.tsx` / `model/costBreakdown.ts` 的类型分支、`src/index.css`（选框样式）

## Implementation checklist

- [x] `types.ts` 的 `Selection` 增加 `{ kind: 'group'; ids: string[] }`，仓库内所有 `s.id` 访问点按 TS 报错补齐分支
- [x] `furnitureGroup.ts`（框选函数并入此文件）：`furnitureInRect` 按「四角全部在框内」返回 id，`normalizeRect` 支持任意方向的拖拽
- [x] `furnitureGroup.ts`：`groupIds` 过滤失效 id、`groupBounds` 返回整组外接框、`moveGroup` 用同一步进取整位移平移
- [x] `Workbench` 新增 `marquee` 状态与 2D 工具栏「框选」开关（`SquareDashedMousePointer` 图标、快捷键 M），切换绘墙 / 门 / 窗 / 3D 时自动关闭，只读不显示
- [x] `PlanCanvas` 新 prop `marquee`：开启时空白处左键拖动进入 `marquee` 并实时渲染选框；关闭时空白处拖动仍是 `pan`
- [x] `PlanCanvas` 圈选松开：0 件清空选择、1 件单选、≥2 件 `{kind:'group'}`；`pointercancel` 清掉选框
- [x] 开关开启时画布光标为十字、状态栏提示框选操作
- [x] `PlanCanvas` 拖动组内任一家具走 `groupmove`，整组按同一位移 `preview`，松手 `commit` 可撤销
- [x] 覆盖层渲染 `marquee` 选框与 `group` 的逐件虚线框 + 整组外框；`selectionPoints` 支持 `group`
- [x] `Workbench.remove()` 支持 `group` 批量删除；方向键在有 `group` 时整组移动；切 3D 时清空 `group`
- [x] `SelectionEditor` 在 `group` 下只显示「已选中 N 件家具」+ 删除 + 取消选择
- [x] `roomRemoval.roomOwnWalls` 只把「单独围出该房间」的墙判为独立墙，两侧都有房间的墙判为共用墙
- [x] `roomRemoval.removeRoom` 逐面复用 `removeWall` 的愈合 / 并房 / 清理流水线，并清除房内家具
- [x] `removeRoom` 在房间仍被围合（共用墙 / 承重墙）时抛错，不产生半拆状态（提交前完成全部校验）
- [x] `SelectionEditor` 房间工具条改为下拉：「清空房间家具（Delete）」+ 二次确认的「删除房间」，`Workbench` 透传 `removeRoom`
- [x] `Workbench` 工具栏把「撤销 / 重做」组移到「重置方案 / 清空」组右侧，窄屏下不出现重复分隔线

## Verification checklist

- [x] `pnpm test`（vitest）：新增 `rectSelect.test.ts`（全含选中 / 一角在外不选 / 空框）、
      `furnitureGroup.test.ts`（整组相对位置不变、失效 id 过滤、单件降级）、`roomRemoval.test.ts`
      （只删独立墙、共用墙保留、外墙一并删除、固定户型删后房间数 -1、承重墙围合时抛错）
- [x] `pnpm lint`、`pnpm run build` 通过（`pnpm exec tsc --noEmit` 确认 `Selection` 新变体无遗漏分支）
- [x] 手工验证 2D（`pnpm dev`，桌面 1280 宽）：
  - 开关关闭：左键拖空白处平移画布，与改动前一致；
  - 开关开启（或按 M）：拖出矩形 → 框内（四角全在框内）家具整组选中，可见选框；点空白未拖动仍是选房间 / 取消选择；
    滚轮缩放可用；切到绘墙后开关自动关闭；
  - 点中组内一件拖动 → 整组同位移，位置关系不变；Delete 删除整组，Ctrl+Z 可撤销；
  - 单选家具的移动 / 吸附 / 靠墙阻挡行为与改动前一致；
  - 参考户型与空白户型各删一个房间：独立墙与墙上门窗消失、共用墙保留、相邻房间仍在、房内家具被清空、
    顶栏提示数量正确、Ctrl+Z 可撤销；对「四周都是共用墙」的房间给出明确失败提示而不是拆一半；
  - 选中房间时下拉可见两项，Delete 仍只清空家具、不改动墙体；
  - 顶部工具栏顺序为 选择 / 框选 / 绘墙 / 门 / 窗 | 重置方案 / 清空 | 撤销 / 重做，撤销重做的禁用状态与 Ctrl+Z 正常。
- [x] 移动端宽度（≤1100）下「框选」按钮可见可点，开关开启时单指拖动为圈选、关闭时为平移，双指缩放始终可用
