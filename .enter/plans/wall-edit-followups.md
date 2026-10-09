# 改墙四件事 + 编辑栏 / 提示文案避让距离标注

## Context

用户的 4 条反馈（截图：一面竖墙被拖到横墙上交叉，交界处没有分割）：

1. 两面墙交错（十字），以及 T 形相接时，交界处自动分割。
2. 删除房间：(a) 点击房间后，浮动编辑栏出现删除按钮，只删地板（房间）与房间里的家具，墙保留；(b) 删除一面墙后，如果原来的房间不再被墙围住，这个房间和里面的家具一起删掉（「墙删除就彻底删除呗」）。
3. 在选择模式下，鼠标在墙身上时默认可以开始画墙：悬停墙身出现绘墙起点，点一下就从这一点开始画新墙；按住拖动仍是移动墙。
4. 移动墙时，贴着这面墙的家具跟着移动。
5. 选中门窗时，浮动编辑栏（visual editor bar）和距离标注重叠了，两样都要能看到；悬停墙身时的提示文案（「点击开始绘墙」/「点击连接」）也不能和距离标注重叠。

已核对的现状：

- 自动分割 `splitAtJunctions(design, wallId)`（`model/wallAutoSplit.ts`）已经同时处理 T 形与十字，但只有「画新墙」（`useWallDrawing.ts`）调用它。拖墙身（`wallmove`）、拖墙端点（`endpoint`）在 `PlanCanvas.tsx` 的 `finish()` 里只做 `syncRooms`；按尺寸改墙（`Workbench.tsx` 里的 `editDimensionWalls`）也一样，所以截图这种情况不会被切开。
- 房间目前**没有任何删除入口**：`Workbench.remove()` 只处理家具、门窗、墙；`SelectionEditor` 的删除按钮只在 `f || o || deletableWall` 时显示。
- `removeWall` 上一轮改成了「房间一律保留」；本次按 2(b) 改回：删墙后新出现的开敞房间要删掉，而且要连同里面的家具一起删。
- 移墙不带家具：`wallmove` 预览只平移墙端点，家具（`Furniture {cx, cy, w, d, rot}`）不动。
- 选择模式下悬停墙身已有 `WallHoverOverlay`（高亮 + 悬停点到两端的距离 + 圆点）；在墙身上按下会选中墙，拖动超过 5 px 才变成移动墙；不拖直接松开现在什么都不做。

## 方案

### 1. 改墙后的交接点自动分割

- `PlanCanvas.finish()`：`wallmove` / `endpoint` 提交时，先 `syncRooms`，再 `splitAtJunctions(next, dr.id)`；空白户型最后再 `rebuildRooms`（顺序与画墙一致：分割只改墙段划分，不改墙体足迹，房间仍然成立）。仍然只 `commit` 一次，一次撤销即可回到拖动前。
- `Workbench` 按尺寸改墙（`editDimensionWalls` 的结果）提交前，对位置变化的每面墙（按 id 对比 before/after 的 `a`、`b`）依次做 `splitAtJunctions`。
- 新增 `splitAtJunctionsOf(design, wallIds)`（放在 `wallAutoSplit.ts`）供上面两处共用。分割规则与画墙完全一致（T 形、十字都切；洞口内部、离墙端不到 50 mm 的点不切；空白户型外框不切）。
- 已经交叉、但这次没改过的墙（截图那面竖墙）不会被追溯分割；动它一下（拖动、改尺寸）就会切开。

### 2. 删除房间与房间里的家具

新增 `model/roomFurniture.ts`：

```ts
/** 删除房间（地板）及中心点落在该房间内的家具；墙保持不动。只剩一个房间时抛错「至少保留一个房间」。 */
export function removeRoom(d: Design, roomId: string): Design;
/** 编辑前中心点在房间里、编辑后不在任何房间里的家具一并删除（被删房间里的家具）。 */
export function dropOrphanFurniture(before: Design, after: Design): Design;
```

- 判定用现成的 `inRoom([f.cx, f.cy], room)`。房间合并（删隔墙）时家具仍落在合并后的房间里，所以不会被误删。
- 2(a) 入口：
  - `SelectionEditor`：选中房间时显示「删除对象」按钮（与家具、门窗共用同一个 `p.remove`）。
  - `Workbench.remove()`：增加 `room` 分支，`change(d => removeRoom(d, id))`，提示「已删除房间及其中 N 件家具，可撤销恢复」。Delete / Backspace 快捷键自动生效。
  - 已知限制：空白户型的房间按外框重算，删掉的地板在下一次改墙时会重新生成（不在本次范围）。
- 2(b) `removeWall`：合并两侧房间（上一轮逻辑不变）→ `dropOpenRooms(merged, design)`（只删这次删墙后新出现的开敞房间，原本就开敞的保留）→ `dropOrphanFurniture(design, result)`。删完一个房间都不剩时（例如空白户型删外框墙）抛错「删除后将没有房间，无法删除这面墙」，与现有「承重墙不可删除」一样走 `notify.fail`。
- 同一条规则也用在 `syncRooms`（拖墙、改尺寸让房间开敞而被删时，里面的家具也一起删），保证「房间没了，家具就没了」在所有改墙入口都一致。

### 3. 选择模式下单击墙身开始画墙

- 悬停：选择模式的悬停点改用 `resolveWallPoint`（与绘墙相同的吸附：端点、交点、洞口边），圆点旁加标签「点击开始绘墙」（`WallHoverOverlay` 新增 `label` 参数，绘墙模式下仍显示「点击连接」）。提示的摆放位置见第 5 节，不与距离标注重叠。
- 单击（按下到松开移动 ≤ 5 px）墙身：切到绘墙工具，并以吸附点作为第一段墙的起点，后续与正常绘墙完全一样（再点一下确定终点，可以连续画；双击、右键、Esc、「完成绘墙」退出）。锁定尺寸的墙（不能移动）也可以作为起点。
- 拖动（超过 5 px）：仍是移动墙，不变。
- 选中墙看属性：按下时仍会选中墙（现有逻辑），单击后进入绘墙状态。**双击墙身**会退回选择模式且墙保持选中，可以用编辑栏和「墙选项」（分割、承重、删除）。现有的双击结束绘墙机制会自然实现这一点，不需要额外代码。
- 实现：`useSegmentDrawing` 新增 `start(p)`（直接把 `p` 设为链起点与草稿）；`PlanCanvas` 新增可选 prop `startWallTool?: () => void`（Workbench 传 `() => setTool('wall')`）；`finish()` 里 `wallmove` 且 `!moved` 时调用 `startWallTool()` 和 `wallDrawing.start(吸附点)`。只读模式不触发。

### 4. 移墙时贴墙家具跟随

新增 `model/furnitureFollow.ts`：

```ts
/** before → after 中被整体平移的墙（长度、方向不变），把贴着它的家具沿墙的法向平移同样距离。 */
export function followWallFurniture(before: Design, after: Design): Design;
```

- 「贴墙」：家具的某条边与墙面平行（角度差 ≤ 1°），离墙面（中心线 ± 半墙厚）不超过 50 mm，且沿墙方向与墙段有重叠。墙两侧的家具都算。
- 只取位移在墙法向上的分量，所以沿墙方向滑动墙不会把家具拖着跑。一件家具同时贴着多面被移动的墙时，按第一面墙处理。
- 端点拖动（改变墙长或角度）不带家具。
- 接入：`PlanCanvas` 的 `wallmove` 预览每一帧都按 `dr.before` 算（拖动中能实时看到家具跟着走，撤销一次全部还原）；`Workbench` 按尺寸改墙提交前也套一次。

### 5. 浮动编辑栏不再盖住门窗的距离标注

现状（截图：选中门，编辑栏压住了右侧的墙端距离）：`SelectionEditor` 的 `position()` 只把舞台上的工具栏（`.stage-topline`、`.canvas-zoom` 等）当障碍物，交给 `placeEditor`（`model/selectionAnchor.ts`）打分。门窗两侧的距离标注（`OpeningDistances` → `WallRangeDimensions`）是画在 SVG 里的，不在障碍物列表里，所以编辑栏会落在它上面。

- `WallRangeDimensions` 新增 `keepVisible` 参数，开启时在根 `<g>` 上加 `data-editor-keep-visible`。`OpeningDistances` 开启它；悬停测距不开（它跟着鼠标走，是临时显示，编辑栏不必为它挪位置）。
- `SelectionEditor.position()`：额外收集舞台里所有 `[data-editor-keep-visible]` 的屏幕矩形（SVG 元素也能取 `getBoundingClientRect`），作为第 5 个参数 `keepVisible` 传给 `placeEditor`。
- `placeEditor(object, viewport, size, obstacles, keepVisible = [])`：
  - 除了原有的 5 个候选位置，再围绕「选中对象 ∪ keepVisible」的外接矩形生成同样的 5 个候选位置（标注在门下方时，编辑栏可以放到标注的下方或上方）。
  - 与 keepVisible 重叠按与障碍物相同的权重（×10）计分，所以只要有不重叠的位置就一定选它；原有候选排序与边界裁剪规则不变。
- 编辑栏的位置在选中对象、视图缩放或平移、尺寸变化时会重新计算（现有的 `onAnchor` 链路）。标注与选中状态在同一次渲染里生成，计算位置时已经能读到。

**悬停提示文案与距离标注不重叠**

现状：`WallHoverOverlay` 把「点击连接」固定画在圆点右上方（`x + 12/scale, y − 12/scale`）；两段距离读数由 `WallRangeDimensions` 画在墙的法向 `n = (−uy, ux)` 一侧，位置在两段的中点。墙的走向一变（例如从下往上画的竖墙、从右往左画的横墙），提示就会和读数落在同一侧，压在一起。

- `WallRangeDimensions` 导出 `rangeSide(wall)`（即上面的法向 `n`，读数所在一侧），供提示计算位置复用，保证两边对「哪一侧」的判断一致。
- 提示改画在墙的**另一侧**（`−n` 方向），距中心线 `thickness/2 + 20/scale`，并以悬停点为水平中心；文字按 `−n` 的方向选 `textAnchor`/`dominantBaseline`，让文字整体朝远离墙的方向展开，不压墙身也不压圆点。
- 读数与提示分处墙的两侧，任何墙的走向、缩放比例下都不会互相覆盖；屏幕上的像素间距由 `/scale` 保证不随缩放变化。
- 绘墙模式的「点击连接」与选择模式的「点击开始绘墙」都走这条逻辑。

## 关键文件

- 新增：`src/features/interior/model/roomFurniture.ts`、`src/features/interior/model/furnitureFollow.ts`，以及对应的 `*.test.ts`
- 修改：`model/wallAutoSplit.ts`（`splitAtJunctionsOf`）、`model/wallRemoval.ts`、`model/roomFollow.ts`（`syncRooms`）、`model/selectionAnchor.ts`（`placeEditor`）、`components/PlanCanvas.tsx`、`components/useSegmentDrawing.ts`、`components/WallHoverOverlay.tsx`、`components/WallRangeDimensions.tsx`、`components/OpeningDistances.tsx`、`components/SelectionEditor.tsx`、`components/Workbench.tsx`
- 复用：`splitAtJunctions`、`dropOpenRooms`、`mergeRoomsAcrossWall`、`inRoom`、`resolveWallPoint`、`length`、`nearestOnWall`
- 不动：`wallFaces.ts`、`roomEnclosure.ts` 内部逻辑（另一个会话在改）

## Implementation checklist

- [ ] `wallAutoSplit.ts`：新增 `splitAtJunctionsOf(design, wallIds)`
- [ ] `PlanCanvas.finish()`：`wallmove` / `endpoint` 提交时 `syncRooms` → `splitAtJunctions` → 空白户型 `rebuildRooms`，只 `commit` 一次
- [ ] `Workbench` 按尺寸改墙：提交前对位置变化的墙做 `followWallFurniture` + `splitAtJunctionsOf`
- [ ] `roomFurniture.ts`：`removeRoom`（含「至少保留一个房间」）与 `dropOrphanFurniture`
- [ ] `SelectionEditor`：选中房间时显示删除按钮；`Workbench.remove()` 增加房间分支和提示文案
- [ ] `wallRemoval.ts`：合并 → `dropOpenRooms(merged, before)` → `dropOrphanFurniture`；删到一个房间都不剩时抛错
- [ ] `roomFollow.syncRooms`：丢掉开敞房间后再 `dropOrphanFurniture`
- [ ] `furnitureFollow.ts`：`followWallFurniture`（平行 ≤ 1°、距墙面 ≤ 50 mm、沿墙有重叠、只取法向位移）
- [ ] `PlanCanvas` 的 `wallmove` 预览接入 `followWallFurniture`
- [ ] `useSegmentDrawing.start(p)`；`PlanCanvas` 的 `startWallTool` prop；选择模式单击墙身（≤ 5 px）进入绘墙并以吸附点为起点
- [ ] 选择模式悬停点改用 `resolveWallPoint`，`WallHoverOverlay` 显示「点击开始绘墙」
- [ ] `WallRangeDimensions` 新增 `keepVisible` → `data-editor-keep-visible`；`OpeningDistances` 开启它
- [ ] `placeEditor` 新增 `keepVisible` 参数：围绕「对象 ∪ 标注」增加候选位置，与标注重叠按 ×10 计分
- [ ] `SelectionEditor.position()` 收集 `[data-editor-keep-visible]` 的矩形，传给 `placeEditor`
- [ ] `WallRangeDimensions` 导出 `rangeSide(wall)`；`WallHoverOverlay` 的提示改画在 `−rangeSide` 一侧，按方向选择文字对齐方式

## Verification checklist

- [ ] 单测 `wallAutoSplit`：拖动墙端点停在另一面墙身上（T 形），宿主墙被切成两段；把一面墙平移到与另一面墙十字交叉，双方都被切开；空白户型外框不切
- [ ] 单测 `roomFurniture`：删除房间后里面的家具被删除、别的房间里的家具保留、墙不变；只剩一个房间时抛错
- [ ] 单测 `wallRemoval`：删外墙让房间开敞，房间与里面的家具一起删除；删隔墙合并两侧房间时家具全部保留；空白户型删外框墙抛「删除后将没有房间」；更新上一轮「外墙删除后房间保留」的旧断言
- [ ] 单测 `furnitureFollow`：贴墙家具（两侧都试）跟着平移相同的法向距离；离墙 100 mm 的家具、沿墙方向滑动墙、端点拖动都不带家具
- [ ] 组件测试 `PlanCanvas.test.tsx`：选择模式单击墙身进入绘墙且草稿起点是吸附点；拖动墙身仍是移动墙，且贴墙家具一起移动
- [ ] 组件测试 `SelectionEditor.test.tsx`：选中房间时出现「删除对象」按钮
- [ ] 单测 `selectionAnchor.test.ts`：按截图布局（门在墙上方，两段标注在墙下方，原来的首选位置压住右侧标注），新结果与两段标注都不重叠且仍在视口内；不传 `keepVisible` 时结果与原来一致（回归）
- [ ] 视觉：preview 在 desktop_1280 下选中一扇门，截图确认编辑栏与两侧距离标注都完整可见
- [ ] 组件测试 `WallHoverOverlay.test.tsx`：横墙、竖墙各取正反两个走向（共 4 种），提示文字锚点与两段距离读数分别位于墙中心线两侧（有符号距离一正一负），且离中心线至少 `thickness/2`
- [ ] 全量 `pnpm exec vitest run src/features/interior`：除另一个会话的 `dimensionWallEdit` 既有红灯外无新增失败；`pnpm lint` 0 error；`pnpm run build` 通过
- [ ] 未验证（需人工点击）：真实指针下悬停标签、单击开画、双击回到选中，以及拖墙时家具跟随的手感
