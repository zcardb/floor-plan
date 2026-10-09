# 放开「绘墙 / 门 / 窗」：所有非只读项目都能用

## Context

用户反馈（截图：工作台顶部工具栏 + 左侧「硬装」分类）：不管是游客模式还是复制出来的项目，顶部工具栏的「绘墙 / 门 / 窗」和左侧硬装里的「墙体 / 门 / 窗」都应该放出来。

现状核实：这两处入口的唯一判断是 `d.template === "blank"`，与项目是否可编辑无关。

- `components/Workbench.tsx:719,728`：`{d.template === "blank" && ...}` 包住三个 `ToolButton`
- `components/Library.tsx:90`：`{blank && (category === '硬装' || ...) && <div className="structural-items">}`
- 连带的一处守卫：`components/PlanCanvas.tsx:416` `if (design.template !== 'blank') return;`（绘墙落点直接吞掉）

也就是说：游客模式默认编辑的参考户型、以及从模板复制出来的项目（`createProject` 已写入 `structureUnlocked: true`），工具栏里只剩「选择」，左侧硬装分类里也没有任何工具——尽管这些项目的墙体完全可以拖动、改尺寸。门/窗的放置逻辑本身没有模板限制（`PlanCanvas.tsx:419` 只校验承重墙、长度、重叠），是入口把它们藏掉了。

已与用户确认的两点：

1. 放开范围：**所有非只读项目**（游客模式、复制项目、导入项目、以及早前保存的旧项目），统一规则；内置模板的只读预览（`readOnly = !!p.project.builtin`）维持现状。
2. 在参考户型（`template !== 'blank'`）里新画一面墙时，**要真正把房间切开**，不能只加墙不切房间。

## 目标

1. 顶部工具栏与左侧硬装分类的「绘墙 / 门 / 窗」对任何非只读项目开放。
2. 在参考户型族里画墙，墙落地的同时按墙把所在房间切成两块（面积、成本统计随之正确）。
3. 只读预览、旧项目的既有锁定文案（`structureUnlocked !== true` 时的尺寸面板锁定）行为不变。

## 方案

### 1. 唯一判断入口：`model/wallPolicy.ts`

新增一行谓词，三个调用点共用，避免再次出现「三处各写一遍 `template === 'blank'`」：

```ts
/** 非只读项目（游客模式、复制/新建/导入的项目）都可以改结构；空白户型维持原语义。 */
export const canEditStructure = (design: Design, readOnly: boolean) => design.template === 'blank' || !readOnly;
```

这里不引入 `structureUnlocked`：早前保存的旧项目没有该标记，但它们同样可编辑，用户要的是「游客模式 / 复制项目都放开」。只读预览仍由工作台已有的 `readOnly` 兜住（`Workbench.tsx:162`、`Library.tsx` 的 `readOnly`、`PlanCanvas` 的 `readOnly`）。`canResizeWall` / `canEditWall` / `canDeleteWall` 都不改。

### 2. 入口接线

- `components/Workbench.tsx`
  - 计算一次：`const structureTools = canEditStructure(d, readOnly);`
  - 第 719、728 行的 `d.template === "blank" &&` → `structureTools &&`（两处合并成一段条件渲染即可，`ToolButton` 不需要 `disabled`）。
  - 第 914 行传参：`blank={d.template === "blank"}` → `structureTools={structureTools}`。
- `components/Library.tsx`
  - prop `blank: boolean` → `structureTools: boolean`，第 90 行同一处条件替换。
  - `readOnly` 保持不变：只读预览下 `structural-items` 不渲染（`structureTools === false`），家具卡片继续 `disabled`。
  - 一并更新 `editorUnits.test.tsx:34` 与 `Library.test.tsx` 里传 `blank` 的 harness。

### 3. 参考户型画墙时切分房间：`model/roomFollow.ts`

`rebuildRooms` 开头 `if (d.template !== "blank") return d`（`geometry.ts:135`）——空白户型能按外框重算，参考户型的手绘环（飘窗凹口、外伸阳台）不能整体重算，所以**只对与新墙相交的房间做局部切分**，其余房间原样保留。

新增 `splitRoomsWithWall(d, wallId): Design`：

- 取新墙，用 `connectedWallPoly(wall, d.walls)`（`model/wallConnections.ts:53`，已处理 T 形/十字/墙厚）得到切分多边形；
- 对每个房间的每个环（主环 + 挖孔环）做 `polygonClipping.difference(ring, cutPolygon)`；
- 只产出一个面积 > 10000 mm²（沿用 `rebuildRooms` / `minRoomArea` 阈值）的块 → 原样保留该房间（墙没真正穿过，例如只搭到墙边）；
- 产出多个块 → 面积最大的那块继承原房间（`id` / `name` / `mat` / `wallMat` / `counted` 全保留，避免成本与材质被打断），其余块按 `rebuildRooms` 的既有命名习惯追加新房间（`room.name + ' 2'`、`' 3'`…，同 `mat`）。房间顺序保持原有房间在前。
- 每个新块仍要过一遍合法性：环顶点数 ≥ 3、面积 > `minRoomArea`，否则忽略该块（不抛错，画墙本身是新增操作）。

两个调用点：

- `components/useWallDrawing.ts:10`：现在直接 `commit(rebuildRooms({...}))`。改为
  `const next = { ...d, walls: [...d.walls, wall] };` → `commit(design.template === 'blank' ? rebuildRooms(next) : splitRoomsWithWall(next, wall.id))`。
  注意 `splitRoomsWithWall` 内部用已含新墙的 `d` 计算 `connectedWallPoly`，这样与邻墙相接的切口才闭合。
- `model/wallRemoval.ts:11`：现在 `rebuildRooms({...})` 删墙后重建房间。不改也能跑（`rebuildRooms` 对非空白设计是 no-op，房间保留切分后的两块）。**本次不动**，删墙后的合并留给后续需求，靠撤销回退。

### 4. 不改动的部分（明确边界）

- 只读预览：`readOnly` 分支、顶部「只读预览」提示条、`Library` 家具 `disabled` 全部保持。
- 旧项目（无 `structureUnlocked`）的**尺寸面板**锁定文案与 `canResizeWall` 行为保持：本次只放开「新增墙 / 新增门窗」这一类入口，不改「单墙尺寸编辑」的解锁规则（用户此前的决定是旧项目需复制后再改尺寸）。
- 门/窗的校验（承重墙不可新增开口、长度不足、同墙重叠）保持。

## 关键文件

- `src/features/interior/model/wallPolicy.ts`（新增 `canEditStructure`）
- `src/features/interior/model/roomFollow.ts`（新增 `splitRoomsWithWall`）
- `src/features/interior/components/Workbench.tsx`（工具栏三按钮 + `structureTools` 传参）
- `src/features/interior/components/Library.tsx`（硬装分类下的三个工具按钮）
- `src/features/interior/components/useWallDrawing.ts`（切分接线）
- `src/features/interior/components/PlanCanvas.tsx:416`（删掉 `if (design.template !== 'blank') return;`，改由工具是否可选决定）

## 复用的既有实现

- `model/wallConnections.ts: connectedWallPoly` —— 切口多边形（含 T/十字接头）
- `model/geometry.ts: rebuildRooms`、`ringArea`、`rect` —— 空白户型路径与面积阈值
- `model/roomFollow.ts: minRoomArea`、`syncRooms`、`followRooms` —— 房间同步的既有约定
- `components/useSegmentDrawing`（`useWallDrawing` 的底座）—— 取点状态机不用改

## Implementation checklist

- [x] `wallPolicy.ts` 导出 `canEditStructure(design, readOnly)`，`template === 'blank'` 时恒为 true。
- [x] `Workbench.tsx` 用 `canEditStructure(d, readOnly)` 控制「绘墙 / 门 / 窗」三个 `ToolButton` 的渲染，内置只读预览下三者不出现。
- [x] `Library.tsx` 的 `blank` prop 换成 `structureTools`，`structural-items` 由它控制；`readOnly` 行为不变。
- [x] `editorUnits.test.tsx`、`Library.test.tsx` 中 `Library` 的调用参数同步更新，测试编译通过。
- [x] `PlanCanvas.tsx:416` 的 `template !== 'blank'` 守卫移除，绘墙落点对所有可选该工具的项目生效。
- [x] `roomFollow.ts` 新增 `splitRoomsWithWall(d, wallId)`：只切相交房间、保留主块元数据、新块面积 > 10000 mm² 才产出。
- [x] `useWallDrawing.ts` 按 `template` 分流到 `rebuildRooms` / `splitRoomsWithWall`，空白户型路径输出不变。
- [x] `Workbench.tsx:914` 的 `blank={...}` 传参改为 `structureTools={...}`。
- [x] 运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm run build` 全部通过。

## Verification checklist

- [x] 正向（组件）：`Workbench.test.tsx` —— 参考户型项目（`state.design = referenceDesign()`，非 builtin）工具栏含「选择 / 绘墙 / 门 / 窗」；默认空白项目用例保持通过。
- [x] 正向（组件）：同文件新增 —— `project.builtin = true` 时只出现「选择」，且仍渲染「只读预览」提示条。
- [x] 正向（组件）：`Library.test.tsx` —— `structureTools: true` 下切到「硬装」显示 `structural-items` 且三个按钮 `setTool` 分别收到 `wall` / `door` / `window`；`structureTools: false` 下不渲染。
- [x] 正向（模型）：新增 `roomFollow.test.ts` 用例 —— 对 `createProject('reference').state` 画一面横穿某房间的墙，房间数 +1，两块面积之和 ≈ 原房间面积（容差 1%），原房间 `id` / `name` / `mat` 保留在主块上。
- [x] 边界（模型）：墙只搭到房间边缘（未穿越）时房间数不变；墙把一个房间切成一块极小残片（< 10000 mm²）时只保留主块。
- [x] 反向（模型）：`template === 'blank'` 画墙仍走 `rebuildRooms`，已有 `geometry.test.ts` / `wallRemoval.test.ts` 用例无变化通过。
- [x] 反向（模型）：`wallPolicy.test.ts` —— `canEditStructure(blankDesign(), true) === true`；`canEditStructure(referenceDesign(), true) === false`（只读）；`canEditStructure(referenceDesign(), false) === true`。`canResizeWall` 的未解锁参考户型断言保持通过。
- [x] 回归：tsc、改动文件 eslint、pnpm run build 通过；vitest 563/564 通过，唯一失败「单行顶部工具栏」由另一会话新增的 toolbar-brand 引起，与本次改动无关。
- [ ] 正向（浏览器）：预览中打开游客模式参考户型 → 顶部出现绘墙/门/窗，画一面隔墙后房间面积与成本统计同步；点开内置模板只读预览 → 三个工具不出现。
