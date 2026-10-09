# 修掉「院子」地面上的神秘小白条（房间轮廓里的残留碎洞）

## Context（为什么做这件事）

用户在平面图里圈出「院子」右上角一个很小的白条，问「这啥东西，可以删除吗」，随后反馈：**点不中、也删不掉**。

查数据库里该方案（`interior_design_projects` / `参照原图保留堂屋与院落分区`，10.00 × 9.74 m）后确认：

- 红框那个位置**没有任何设计对象**（不是家具、不是墙、不是门窗）——把截图里的家具/房间/墙坐标逐条对照后，唯一落在红框中心的是 `院子` 房间轮廓里的**第二个环（洞）**：
  `[[6740,5260],[6740,5610],[6860,5610],[6860,5260]]`，即 **120 × 350 mm** 的小洞。
- 它是一个房间轮廓的洞环，不是可选中对象：`inRoom()`（`model/geometry.ts:65`）对洞内点返回 false，`roomPath()` 用 `fillRule="evenodd"` 画，所以点它既不会命中 `[data-room]`、更不会是 `[data-fid]/[data-wall]/[data-opening]` → 点击只会取消选择（`PlanCanvas.tsx:332-335`）。UI 里也没有任何入口能删它。
- 它就是「删掉院子与楼梯间之间那面墙」之后留下的**墙垛残块**：洞的宽度 120 = 隔墙厚度，位置正好是原墙（AI 方案里 `x=6800` 的那道墙）的墙带，底边 5610 = 现墙 `aff3dbe1` 内表面 5660 − 容差 50（`roomMerge.ts` 的 `GAP_TOLERANCE`）。合并跨墙房间用的是 polygon-clipping 的 `union` + `difference`，`mergeRoomsAcrossWall` 会把结果里的所有环（含洞）都写进 `room.rings`，于是这种碎块就以「洞」的形态留在了房间里。
- 影响：房间面积被少算（`area()` 会扣洞）：院子显示 76.37 m²，去掉碎洞后是 **76.41 m²**；3D 地面（`Scene3D.tsx:846` 用 `rings` 作 holes）、导出图纸也跟着有这个缺口。

结论：**问题不是「不能删」，而是这东西根本不是对象**。修法是让它别再出现、并把已存在的数据自动清掉。

## 方案（推荐做法）

新增一个「房间轮廓碎洞清理」的纯函数，并在「会产生洞的几何操作」和「加载校验」两处调用；不新增 UI，不做「洞可选可删」。

### 1. 新增 `src/features/interior/model/roomHoles.ts`

- `isStrayHole(ring: Point[], wallThickness: number): boolean` — 判定「墙垛碎块」形态的洞环（常量集中定义并写清理由）：
  - 面积 `< 0.5 m²`（再大就按真实空洞处理）；
  - 最短边 `≤ max(200, wallThickness)` mm（碎块宽度最多就是墙厚量级；真实井道/庭院/柱子不会这么窄）；
  - 最短边 / 最长边 `≤ 0.5`（细长条才算碎块，方正的柱/垛保留）。
  - 用户这个洞：120 × 350 mm、0.042 m²、比值 0.34 → 判定为碎块 ✓；240 × 240 的柱子（比值 1.0）和 1.2 × 1.2 m 的井道保留 ✓。
- `stripStrayHoles(design: Design): Design` — 对每个房间 `rings`：保留第一个环（外轮廓），丢掉判定为碎块的洞环。**没有任何洞被丢时返回原 `design` 引用**（多处测试依赖 `toBe` 的引用相等语义，例如 `roomMerge.test.ts:57`、`roomFollow.test.ts:52`）。
- 复用现成的 `ringArea`、`bbox`（`model/geometry.ts`），不要自己写面积/包围盒。

### 2. 在会产生洞的操作里立刻清一次

- `src/features/interior/model/wallRemoval.ts`：`removeWall()` 返回前包一层 —— `return stripStrayHoles(dropOrphanFurniture(design, kept))`（删墙 → 并房是这次问题的来源路径）。
- `src/features/interior/model/roomFollow.ts`：`splitRoomsWithWall()` 返回前同样过一遍（画墙切开房间用的也是 `difference(room.rings, [cut])`，同一类残留）。

### 3. 加载时修复已存在的方案

- `src/features/interior/model/validation.ts`：在最后的归一化返回里给 `rooms` 加上 `stripStrayHoles` 同样的清理（与现有 `normalizeRoomSurfaces` / `normalizeFurniture` 同一层职责；加载路径都走这里：`useProjects.ts:358`、`guestStore.ts`、`designImport.ts`）。
- 效果：用户重新打开 `参照原图保留堂屋与院落分区` 时，白条自动消失、院子变成 76.41 m²；保存后即为干净数据。清理是幂等的，`validateDesign(JSON.parse(JSON.stringify(x))) toEqual x` 这类既有断言不受影响（正常方案里没有碎洞）。

### 不做的事

- 不加「洞可选/可删」的 UI（洞是房间几何的一部分，不是对象）。
- 不改 `mergedRings` 的并集算法本身：残留洞可能是任意大小的封闭空腔，按形态阈值清理比改并集更稳，也不会误伤 CAD 导入的真实空洞。

## 关键文件

- 新增：`src/features/interior/model/roomHoles.ts`（+ `roomHoles.test.ts`）
- 修改：`src/features/interior/model/wallRemoval.ts`、`src/features/interior/model/roomFollow.ts`、`src/features/interior/model/validation.ts`
- 测试补充：`src/features/interior/model/wallRemoval.test.ts`、`src/features/interior/model/validation.test.ts`

## 测试

- `roomHoles.test.ts`（用真实数据）：
  - 用户方案里 `院子` 的两环轮廓（外环 + `[[6740,5260]…[6860,5260]]`）→ 清理后只剩 1 环，面积由 76.37 → 76.4076 m²。
  - 反例：`240×240` 柱子洞、`1200×1200` 井道洞、`300×800`（短边 300 > 240）洞 → 保留。
  - 幂等：清理两次结果相同；无可清理内容时返回同一引用。
- `wallRemoval.test.ts`：删墙后留下的碎洞被清除（在既有 fixture 上构造一个 120 宽、位于残留墙带内的洞）。
- `validation.test.ts`：加载含碎洞的方案 → 被清理；不含碎洞的方案 round-trip 不变。

## 验证

- `pnpm test`（`vitest run src/features/interior`）
- `pnpm lint`、`pnpm exec tsc --noEmit`（`pnpm check`）
- `pnpm run build`
- 手动：重新打开该项目 → 院子右上角白条消失、面积 76.41 m²（本间造价随之微调约 0.04 m² 的地面费用），3D 地面无缺口。预览环境无法登入用户账号，故这一步以测试 + 用户重开项目确认为准。

## Implementation checklist

- [ ] `roomHoles.ts`：定义碎洞三条件常量与 `isStrayHole`，复用 `ringArea`/`bbox`。
- [ ] `roomHoles.ts`：`stripStrayHoles(design)` 只丢洞环、保留外环，无变化时返回原引用。
- [ ] `wallRemoval.ts`：`removeWall` 成功返回前调用 `stripStrayHoles`。
- [ ] `roomFollow.ts`：`splitRoomsWithWall` 返回前调用 `stripStrayHoles`。
- [ ] `validation.ts`：加载归一化中对 `rooms` 应用同样的清理。
- [ ] `roomHoles.test.ts`：真实院子数据被清、柱子/井道洞保留、幂等与引用不变。
- [ ] `wallRemoval.test.ts`：删墙残留碎洞被清，既有并房断言（`roundTrip`、`toBe`）不变。
- [ ] `validation.test.ts`：含碎洞方案加载后被修复；无碎洞方案 round-trip 相等。

## Verification checklist

- [ ] `pnpm test` 全绿（含新增用例与既有 `roomMerge` / `roomFollow` / `wallRemoval` / `validation` 套件）。
- [ ] `pnpm lint` 与 `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm run build` 成功。
- [ ] 正向：120×350 碎洞在 `removeWall`、`splitRoomsWithWall`、`validateDesign` 三条路径都被移除，面积 76.37 → 76.41 m²。
- [ ] 边界：`240×240`、`1200×1200`、`300×800` 洞保留；房间只剩外环时不会被清成空 rings。
- [ ] 默认/负向：无洞的房间、无碎洞的方案对象引用与内容均不变（不影响既有 `toBe`/`toEqual` 断言）。
