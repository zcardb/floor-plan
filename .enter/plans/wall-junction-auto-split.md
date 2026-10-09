# 门窗边接触点 + 画墙交接点默认分割

## Context

两处用户诉求（已确认）：

1. **门窗也能作为接触点**，两处都要生效：
   - 「分割墙段」对话框的接触点列表里，除了其他墙的 T 形交接 / 十字穿过，还要列出**门窗洞口两侧边缘**，勾选哪一侧就按那一侧切一刀（现在洞口内的交接点一律 `blocked`、不能选，用户想按洞口边分割时没有入口）。
   - 画墙时的吸附：墙端点可以吸附到门窗洞口边缘，落点即在与墙相接处。
2. **画墙时的交接点默认分割**：新画的墙与已有墙相接（T 形）**以及横穿（十字）**时，自动在交接点把墙切成独立墙段，不必再手动「分割墙段」。

现状要点：

- `wallContacts.ts` 只根据**其他墙的端点/中心线交点**生成接触点，`blocked` 用**取整到厘米后**的 offset 判断，因此正好落在洞口边上的交接点会被误判为洞口内部；洞口本身不产生接触点。
- `wallSplit.ts` 的切点吸附容差 `splitTolerance = 0.01`（毫米级），洞口边若不是 10 mm 的整数倍（如 850 mm 门宽 → 2050.5/2075），两位小数的距离输入永远吸附不到洞口边，会落进洞口内部报错。
- `wallDrawing.ts` 的 `resolveWallPoint` 只有墙**端点**与**中心线交点**两类吸附候选，`WallSnap.target.kind` 只有 `'endpoint' | 'intersection'`。
- 画墙提交链：`PlanCanvas.tsx` → `useWallDrawing.ts` → `useSegmentDrawing.ts`（`submit` 里 `validateWallSegment` → 追加墙 → 空白户型 `rebuildRooms`，其余 `splitRoomsWithWall`），`commit(d, before)` 只压历史，不做房间同步。

## 方案

### 1. `model/wallContacts.ts`：接触点同时来自门窗边

- `WallContact` 扩展：

```ts
export interface WallContact {
  offset: number;
  wallIds: string[];
  kind: 'tee' | 'cross' | 'opening';
  blocked: boolean;
  /** 门窗边接触点：洞口 id、类型，以及所在一侧（start = 靠存储 A 端）。 */
  opening?: { id: string; kind: 'door' | 'window'; edge: 'start' | 'end' };
}
```

- `blocked` 改为按**未取整**的原始 offset 判断，并允许「贴近洞口边」的交接点落在洞口边上的吸附窗口内（10 mm，见下）：原始位置在洞口内部、且到最近洞口边的距离 > `splitEdgeSnap` 时才 `blocked = true`。这样正好停在门口边线上的交接点不再被误判，仍会出现在列表里并可勾选。
- 在原有交叉/合并流程之后追加**洞口边接触点**：每个洞口的 `offset ± width/2` 各一个，`kind: 'opening'`、`blocked: false`、offset 不取整（与 `WallSplit.ts` 的洞口边计算完全同源，保证切点等于洞口边）。
- 间距规则：洞口边接触点与墙端至少 `mergeGap`（50 mm），且与任一已保留接触点至少 `mergeGap`，否则丢弃（交接点优先）。结果保证列表内任意两个接触点间距 ≥ 50 mm，因此任意勾选组合都不会产生碎段、也不会出现重复 offset（React key 唯一）。按 offset 升序返回。

### 2. `model/wallSplit.ts`：洞口边可被距离输入吸附

- 新增导出常量 `export const splitEdgeSnap = 10;`（毫米），仅用于 `wallSplitIntervals` 的切点吸附（第 18 行 `Math.abs(c - edge) <= splitTolerance` 改为 `<= splitEdgeSnap`）；`splitTolerance = 0.01` 继续供 `wallMerge.ts` / `wallBulk.ts` 的共线、同厚判定与洞口归属判定使用，不改语义。
- 效果：两位小数距离（含对话框里的洞口边快捷标签）都能稳定吸到洞口边，切点在洞口边而不是落进洞口报「分割点位于门窗洞口内部」。

### 3. `model/wallDrawing.ts`：画墙吸附到门窗边

- `WallSnap.target.kind` 扩为 `'endpoint' | 'intersection' | 'opening'`。
- 遍历每面墙时，除端点与中心线交点外，把该墙每个洞口的两个边缘点（沿墙中心线偏移 `offset ± width/2` 的世界坐标）作为 `'opening'` 候选；沿用现有屏幕阈值 `12 / scale`，`reference` 与端点一致用 `raw`（允许小幅方向修正，即用户瞄准洞口边即可落到边上）；`exclude` 墙的洞口一并排除。
- 候选优先级：`endpoint` → `opening` → `intersection`，同级按距离。`WallHoverOverlay` 无需改动（`target.wallId` 仍是宿主墙，悬停高亮与「点击连接」保持有效）。

### 4. 新增 `model/wallAutoSplit.ts`：交接点默认分割

```ts
/** 新画墙 wallId 在各方墙上造成的交接切点（毫米，自各墙 A 端量起）。 */
export function junctionCuts(design: Design, wallId: string): Map<string, number[]>;
/** 按交接点默认分割；任何一段失败都保留该墙原样，不阻塞绘制。 */
export function splitAtJunctions(design: Design, wallId: string): Design;
```

- 复用 `wallContacts`：对每面墙取接触点，新墙自身取**全部**交接点（其他墙的端点/中心线落在它身上，含十字穿过），其他墙只取 `wallIds` 含新墙的交接点；过滤 `blocked` 与 `kind === 'opening'`。因此自动分割的切点与对话框接触点**完全一致**，同样自带「距两端 ≥ 50 mm、50 mm 内合并、L 形转角不切」的保护。
- 预筛：先用 `bbox`（含半墙厚余量）过滤掉与新墙不相邻的墙，避免每次绘墙对全部墙做 `wallContacts`。
- 排除空白户型的外围墙（`design.template === 'blank' && wall.kind === 'exterior'`）：`resizeBlank` 一旦发现外围墙被分割就拒绝整体改尺寸（`geometry.ts:198`），外框必须保持整体，与本次请求无关的「空白户型改尺寸」能力不能被破坏。
- 应用方式：每面墙的切点**从大到小逐个**调用 `splitWall`（原 id 始终留在头部，后续切点仍以原 A 端为基准，天然规避 `splitMaxCuts = 12` 上限），单次 try/catch，失败即跳过。

### 5. `components/useWallDrawing.ts`：接入自动分割

```ts
validateWallSegment(d, a, b);
const wall = { id: uid(), a, b, kind: 'partition', thickness: d.thickness };
const added = { ...d, walls: [...d.walls, wall] };
// 先按新墙整体切分房间，再按交接点分割：分割只改墙段，不改墙体几何，房间仍成立。
const rooms = d.template === 'blank' ? added : splitRoomsWithWall(added, wall.id);
const split = splitAtJunctions(rooms, wall.id);
commit(split.template === 'blank' ? rebuildRooms(split) : split);
```

- 顺序保证：`splitRoomsWithWall` 用完整的新墙轮廓切房间（`splitWall` 保持足迹不变，已有测试已覆盖），所以先切房间再分割墙段结果等价，不需要为新墙的每个片段分别切房间。
- 一次 `commit` = 一次历史记录，撤销恢复到画墙前（`before` 快照由 `useSegmentDrawing` 的 `commit` 传入）。

### 6. `components/WallSplitDialog.tsx`：门窗边接触点的文案

- `kinds` 增加 `opening: '门窗边'`。
- 接触点行的 `<small>`：`kind === 'opening'` 时显示 `门/窗洞 · 近 A 侧边缘 / 近 B 侧边缘`（按 `reversed` 翻转 `opening.edge` 的显示侧），不再渲染空 `wallIds`；其余接触点维持「T 形交接/十字穿过 · 相接墙名」。
- 勾选、全选/清空、快捷标签、`aria-label`（`接触点 N` / `接触点 N（位于门窗洞口内）`）沿用现有实现，不新增交互。

### 不改动

- 拖拽墙端点连接时不自动分割（本次只覆盖「绘制」，避免改动拖动提交链）。
- 数据库、项目保存、导出、费用、三维、i18n、家具与编辑器布局。

## 关键文件

- 修改：`src/features/interior/model/wallContacts.ts`、`src/features/interior/model/wallSplit.ts`、`src/features/interior/model/wallDrawing.ts`、`src/features/interior/components/useWallDrawing.ts`、`src/features/interior/components/WallSplitDialog.tsx`
- 新增：`src/features/interior/model/wallAutoSplit.ts`
- 复用：`geometry.ts` 的 `length`/`nearestOnWall`/`bbox`、`wallSplit.ts` 的 `splitWall`、`wallSplitDraft.ts` 的 `displayOffset`、`roomFollow.ts` 的 `splitRoomsWithWall`、`geometry.ts` 的 `rebuildRooms`；`WallSplitPreview.tsx` 与 `PlanCanvas.tsx` 无需改动

## 测试

- `model/wallContacts.test.ts`：洞口两边各成一个 `kind: 'opening'` 接触点并带 `edge`；距墙端 < 50 mm 的洞口边不出现；距交接点 < 50 mm 的洞口边被丢弃；正好落在洞口边上的交接点 `blocked: false`；洞口内部（距边 > 10 mm）仍 `blocked: true`；参考户型遍历用例放宽 `offset % 10` 断言（洞口边允许非厘米）。
- `model/wallSplit.test.ts`：非厘米洞口边（如 850 mm 门宽、边在 2075）用 2.08 m 切点时吸附到 2075，门窗完整迁移且费用/几何不变；洞口内部深处仍抛「洞口内部」。
- `model/wallDrawing.test.ts`：新增洞口 fixture，终点落在洞口边时 `target.kind === 'opening'` 且落点等于精确边缘坐标；同阈值下真实墙端点优先于洞口边；`exclude` 墙的洞口不参与。
- 新增 `model/wallAutoSplit.test.ts`：T 形相接分割宿主墙（段数、总长、洞口迁移、`exteriorRootId`、`calculateCosts` 不变）；十字穿过时双方都被切；空白户型外围墙不参与；交接点落在洞口内部（距边 > 10 mm）时不切；无交接时返回同一对象。
- `components/useWallDrawing.test.ts`：按新行为更新断言（host `'target'` 会被自动分割），并新增一条「画墙后宿主墙已按交接点分成两段」的用例。
- `components/WallSplitDialog.test.tsx`：`junctions()` fixture 下接触点由 3 个变 5 个（1000 T、2050 窗边、2500 洞口内禁用、2950 窗边、4000 十字），更新勾选/预览/快捷标签/交换 A/B 的断言与数量。

## Implementation checklist

- [x] `wallContacts.ts`：`WallContact.kind` 增加 `'opening'` 与可选 `opening: { id, kind, edge }` 字段
- [x] `wallContacts.ts`：`blocked` 改用未取整 offset 且忽略距洞口边 ≤ `splitEdgeSnap` 的情形
- [x] `wallContacts.ts`：为每个洞口的两个边缘追加不取整的 `'opening'` 接触点，并施加「距墙端 / 距已保留接触点 ≥ 50 mm」的间距规则，结果按 offset 升序且 offset 唯一
- [x] `wallSplit.ts`：导出 `splitEdgeSnap = 10` 并用于 `wallSplitIntervals` 的切点吸附；`splitTolerance` 语义与使用点不变
- [x] `wallDrawing.ts`：`WallSnap.target.kind` 增加 `'opening'`，遍历洞口边缘生成候选，优先级 endpoint → opening → intersection
- [x] 新增 `wallAutoSplit.ts`：`junctionCuts`（bbox 预筛 + `wallContacts` 复用 + 空白外围墙排除）与 `splitAtJunctions`（逐切点从大到小调用 `splitWall`，失败跳过）
- [x] `useWallDrawing.ts`：先 `splitRoomsWithWall`/`added` 再 `splitAtJunctions`，空白户型最后 `rebuildRooms`，仍只 `commit` 一次
- [x] `WallSplitDialog.tsx`：门窗边接触点显示「门/窗洞 · 近 A/近 B 侧边缘」，并按 `reversed` 翻转显示侧
- [x] 上述六个测试文件按新行为更新/新增并通过

## Verification checklist

- [x] 正向：`pnpm exec vitest run src/features/interior` → 615 通过、2 个失败，失败项在 `dimensionWallEdit.test.ts` 与 `wallRemoval.test.ts`，属于另一个会话正在改的 `roomEnclosure.ts` / `roomFollow.ts` / `wallFaces.ts` 工作流；已用「把本次改动的 3 个模型文件还原到 `55d35b1` 后单独跑这两个用例仍失败」的方式确认与本次改动无关
- [x] 正向：`WallSplitDialog.test.tsx` 覆盖带窗墙体「接触点分割」列出窗洞两侧边缘、勾选后 `intervals` 切点等于洞口边、应用时传递的 cuts 与该边完全一致
- [x] 正向：`WallSplitDialog.test.tsx` 覆盖单点/两点模式下点洞口边快捷标签写入两位小数距离（2.05 m），`WallSplit.test.ts` 覆盖 2.08 m 输入吸附到 2075 洞口边且门窗完整迁移
- [x] 正向：`useWallDrawing.test.ts` + `wallAutoSplit.test.ts` 覆盖「画墙端点停在已有墙身上 → 宿主墙按交点切成两段」与「端点停在墙面上（半墙厚内）也切」
- [x] 正向：`wallAutoSplit.test.ts` 覆盖十字穿过时宿主墙与新墙都切成独立墙段；L 形转角、平行/隔开的墙不产生分割且返回同一设计
- [x] 负向：`wallAutoSplit.test.ts` 覆盖交接点落在洞口内部（距洞口边超过吸附窗口）时不分割、设计原样返回；对话框仍把该项置灰并提示「位于门窗洞口内部」
- [x] 边界：`wallContacts.test.ts` 覆盖洞口边距墙端 < 50 mm、距交接点 < 50 mm 时不出现在列表；`wallSplit.test.ts` 既有 1–12 点上限与每段 ≥ 0.05 m 用例继续通过
- [x] 边界：`wallAutoSplit.test.ts` 断言画墙后空白户型外框未被分割，`resizeBlank` 仍能整体重设外围尺寸
- [x] 回归：`splitWall`、`wallContacts`、`wallConnections`、`wallMerge`、房间重建、费用与导出既有用例全部通过；`pnpm lint` 0 error（3 个既有 warning）、`pnpm run build` 通过；`pnpm exec tsc -p tsconfig.app.json --noEmit` 仅剩另一个会话 `wallFaces.ts:37` 的 `side0` 未定义（该文件当前无人引用，本次未改动）
- [x] 视觉：preview 在 desktop_1280 下打开 `/`，参考户型二维画布、尺寸标注与房间统计正常渲染，未出现白屏或报错
- [ ] 未验证：真实指针在画布上画墙、以及打开「分割墙段」对话框查看门窗边接触点的交互效果，尚未在浏览器中实测（本次只有单测与截图证据）；移动端宽度未验证

