# 房间「尺寸」：逐边长度查看与实时修改

## Context

选中一个房间后，现在只能看到面积 / 周长 / 开间 / 进深（`PropertyPanel` 的 `stat-grid`），无法看到这个房间**每条边**的长度，也无法按房间来调整尺寸。要改某一条边的长度，只能自己找到那面墙、选中墙、改墙长——用户根本不知道哪面墙对应哪条边。

本次要做两件事（用户已确认的三点决策）：

1. 选中房间时，画布浮动工具条（`.visual-selection-editor`）上「房间 4」名称右侧增加一个**尺寸**入口（与材质 / AI 布局同排）。
2. 右侧「房间属性」面板里，在名称输入框下方（截图红框位置）、`stat-grid` 上方增加一个**房间尺寸**模块。
3. 两处展开后是同一个内容：一个房间小示意图 + 逐边列表。每行是该边的长度，**输入即实时生效**。

关键约束（已向用户确认）：房间轮廓不是独立数据，它是**跟着墙体生成的**（`Room.rings` 由 `rebuildRooms` / `followRooms` 维护）。所以「改一条边」= **沿该边法向平移这条边所贴的墙**，房间跟着变。不能单独改房间轮廓（那样迟早被下一次墙体编辑覆盖）。

无法通过移墙改变的边（外侧是承重墙 / 参考户型结构已锁定 / 外侧是开敞空间的自由边）**照样列出长度**，只标注锁定原因。

## 现状与可复用件（已读过）

| 能力 | 位置 |
|---|---|
| 边界标注 → 真实墙体移动（平移墙带、连接端点伸缩、门窗跟随、碰撞校验、房间同步） | `src/features/interior/model/dimensionWallEdit.ts` |
| 结构面 → 共线墙带分组 | `src/features/interior/model/dimensionBinding.ts` 的私有 `faceGroup()` |
| 墙可调尺寸判定 / 锁定文案依据 | `model/wallPolicy.ts`：`canResizeWall`、`isBearingWall`、`BEARING_WALL_WARNING` |
| 房间跟随墙体 | `model/roomFollow.ts`：`syncRooms`、`followRooms` |
| 输入即生效 + 失焦合并为一步撤销 | `model/sizeTransaction.ts`（`begin/update/apply/cancel/flush/isActive`），用法见 `components/SizeFields.tsx` |
| 米 / 毫米草稿换算（两位小数、保留原值） | `model/lengthUnits.ts`：`formatMeters`、`meterDraft`、`sizeDraftToModel`、`parseMeterDraft` |
| 几何工具 | `model/geometry.ts`：`ringArea`、`length`、`nearestOnWall`、`bbox` |
| 工具条入口写法 / 样式规范 | `components/SelectionEditor.tsx`「材质」入口、`UI_GUIDELINES.md` 第 2–4 节 |

## 设计

### 1. 共享的「墙带平移」核心（重构，不改行为）

把 `dimensionWallEdit.editDimensionWalls` 里的通用部分抽出来，供净距编辑与房间边编辑共用：

- 新增 `moveStructureBand(before, spec, requested, fixed)`，`spec = { axis: 0|1, start, end, startWalls, endWalls, sourceAt? }`。
- `editDimensionWalls` 保持**同样的入参 / 出参 / 抛错文案**，内部改为：`dimensionEditPolicy` + `bindingExists` 校验 → 调 `moveStructureBand` → 复用现有的「结构变化后无法得到指定净距」复验。
- 迁移进 `moveStructureBand` 的逻辑：`delta` 计算、目标墙整体平移、连接墙端点伸缩、方向 / 最短 0.1 m / 越界 / 固定墙连接 / 门窗容纳与重叠 / `validateWallSegment` / 相交面积 / 扫掠穿墙检查，最后 `syncRooms`。
- `dimensionWallEdit.test.ts` 现有 9 组用例必须原样通过（回归闸门）。

### 2. 新模型：`src/features/interior/model/roomSides.ts`

```ts
export interface RoomSide {
  index: number;                  // 规范顺序下的稳定序号
  axis: 0 | 1;                    // 0 横边（沿 x），1 竖边（沿 y）
  start: number; end: number;     // 沿边方向的坐标（对 side 而言是 start 端 / end 端）
  at: number;                     // 边的固定坐标
  length: number;                 // 毫米
  startWalls: string[];           // start 端相邻边所贴墙带（空 = 该端无墙/开敞）
  endWalls: string[];
  fixed?: 'start' | 'end';        // 只有一端可动时，另一端固定
  chooseSide: boolean;            // 两端都可动，需要用户选固定端
  reason?: string;                // 只读原因
}
export function roomSides(d: Design, roomId: string): RoomSide[];
export function editRoomSide(d: Design, roomId: string, index: number, requested: number, fixed: 'start' | 'end'): Design; // 内部走 moveStructureBand
```

要点：

- **规范化外边**：只取 `room.rings[0]`（忽略洞口环），合并相邻共线顶点（参考户型一面墙上被门窗切成多段，用户看到的是「一条边」），丢弃长度 < 1 mm 的退化边。
- **绕向与起点**：按有符号面积统一为顺时针（y 向下的屏幕坐标），并从「最上、其左」的顶点起算 —— 这样改完尺寸重建房间后序号仍指向同一条边。
- **认定所属墙**：一条横边的长度由它两端的**相邻竖边**所贴的墙决定（竖边同理）。对 start / end 端分别取相邻边：面坐标 = `side.start` / `side.end`，scan = 相邻边中点的另一轴坐标，墙在相邻边的房间外侧，所以 `sign = -(相邻边外法向在 side.axis 上的分量)`，调用 `faceGroup(walls, side.axis, face, scan, sign)` 得到墙带。需要把 `faceGroup` 从 `dimensionBinding.ts` 导出，并加一个可选容差参数（默认仍是 0.05；房间顶点来自相交计算，这里用 1.5 mm，与 `roomFollow.faceEpsilon` 一致）。
- **验算**：`editRoomSide` 调用 `moveStructureBand` 后，在结果里按 id 找回该房间、重新 `roomSides`，确认同一 `at` 上存在长度 ≈ `requested` 的边，否则抛「结构变化后无法得到指定长度，请检查连接关系」（与净距编辑同一兜底思路）。
- **可编辑判定**（与净距编辑同一套）：`template !== 'blank' && structureUnlocked !== true` → 整间只读「此项目创建时锁定了结构尺寸，复制该项目后副本可自由调整。」；某端墙带为空（开敞自由边）→ 该端不可动；端上墙带全部可 `canResizeWall` 才可动。两端都不可动 → 「这条边两侧都是固定结构（外围墙 / 承重墙 / 开敞边界），请改相邻的边」。
- **斜边**（DXF 导入户型）：`axis` 判定不成立 → 只读「斜边不支持直接改长度」。

### 3. 编辑实时生效

- 组件用 `sizeTransaction`，模式与 `SizeFields` 一致：`begin(selection)` → 每次输入 `updateWith(token, before => editRoomSide(before, …))` 实时 `preview`，失焦 / 弹层关闭时 `apply` 合并为**一步撤销**，Esc `cancel` 回退。
- `SizeTransaction` 新增 `updateWith(token, edit: (before: Design) => Design)`；原 `update(token, values)` 改为调用 `updateWith(token, d => editSelection(d, selection, numbers))`，对外行为不变（`selectionEdits` 的校验不动）。
- 因为 `update` 永远从**进入编辑前的那份快照**算起，行序号在输入过程中不会漂移（第 2 节的规范顺序是第二道保险）。
- 越界 / 冲突（穿墙、容纳不下门窗、房间退化）时 `update` 抛错 → 行内 `role="alert"` 提示原因，画面保持上一次合法状态。

### 4. 组件（两处共用一份实现）

- 新增 `src/features/interior/components/RoomSidesEditor.tsx`，工具条弹层和右侧面板用同一个组件（props：`design`、`roomId`、`transaction`、`close?`）。
  - **小示意图**：把外边缩放成 ~180×120 的 `svg`，每条边中点放序号徽标（1、2、3…），点击 / 键盘 Enter 聚焦对应行的输入框；当前编辑的边用 `--plan-selection` 高亮。
  - **逐边行**：`[序号徽标] [方位说明] [输入框 m] [−][+]`；`−` / `+` 每次 0.01 m，各自独立 `begin/update/apply`（一步撤销）。只读行显示当前长度 + `LockKeyhole` 图标 + 原因文案。
  - **固定端选择**：两端都可动时，行内给一个两段式选择「固定左/上端 / 固定右/下端」，默认固定 start 端（即往右下方向改变），与净距编辑的 `FixedDimensionSide` 语义一致。
  - **反馈**：底部一行「改动即时生效，可在画布上撤销」，与前一个尺寸弹层的文案一致（`UI_GUIDELINES.md` 的 Feedback Loop 条）。
- `SelectionEditor.tsx`：`r`（房间）分支里新增与「材质」同构的 `Popover` 入口，`<Ruler size={15} /> 尺寸 <ChevronDown size={12} />`；触发按钮显示 `开间 × 进深 m`（如 `1.83 × 2.00 m`，与家具入口的读数格式一致），弹层标题「房间尺寸」。按 `UI_GUIDELINES.md` 用原生 `<button>` + `EditorTooltip` + `.visual-size-trigger` 类。
- `PropertyPanel.tsx`：房间分支在 `property-form`（名称）之后、`stat-grid` **之前**插入
  `<h4 className="property-subtitle">房间尺寸</h4>` + `<RoomSidesEditor …/>`，`stat-grid` 原样保留。

### 5. `src/index.css`

在 `@layer` 之外新增（沿用语义 token，字号只用 11 / 12 / 13）：

- `.room-sides`、`.room-sides-diagram`、`.room-sides-badge`（序号徽标，选中态用 `--primary`）
- `.room-sides-row`、`.room-sides-row-label`、`.room-sides-step`、`.room-sides-locked`（原因文案用 `--muted-foreground`）
- `.room-sides-fixed`（固定端两段式选择）
- 移动端（≤600px）：步进按钮可点区域 ≥ 34px，行内允许换行
- 必要时给 `.visual-editor-popover` 加一个宽度修饰类容纳示意图

## Implementation checklist

- [ ] `dimensionWallEdit.ts` 抽出 `moveStructureBand`，`editDimensionWalls` 行为与文案不变，`dimensionWallEdit.test.ts` 全绿。
- [ ] `dimensionBinding.ts` 导出 `faceGroup`（新增可选容差参数，默认值不变）。
- [ ] 新增 `model/roomSides.ts`：`roomSides()` 返回规范化后的逐边数据（共线合并、顺时针、最上偏左起点、两端墙带、可动性、只读原因）。
- [ ] 新增 `editRoomSide()`：沿边法向平移目标墙带，校验与 `editDimensionWalls` 同级（穿墙、门窗容纳、房间退化、承重 / 锁定）。
- [ ] `sizeTransaction.ts` 新增 `updateWith(token, edit)`，`update` 改为基于它实现，`SizeFields` 行为不变。
- [ ] 新增 `components/RoomSidesEditor.tsx`（示意图 + 逐边行 + 步进按钮 + 固定端选择 + 行内错误）。
- [ ] `SelectionEditor.tsx` 房间分支增加「尺寸」Popover 入口，按钮显示当前边读数，图标 15 / 箭头 12。
- [ ] `PropertyPanel.tsx` 房间分支在名称与 `stat-grid` 之间插入「房间尺寸」模块，`stat-grid` 未改动。
- [ ] `index.css`（`@layer` 外）补齐上述 class，字号仅 11/12/13，颜色只用语义 token，移动端可点区域 ≥ 34px。
- [ ] 新增 `model/roomSides.test.ts`，用例：空白户型矩形房间 4 条边且读数正确；加一道隔墙后改隔墙侧的边 → 隔墙移动、房间面积变化、外围墙不动；门窗切开的共线墙段合并成一条边；L 形房间 6 条边且序号从最上偏左开始顺时针；承重墙一侧 / 参考户型未解锁 / 开敞边给出 `reason`；改到穿墙或容不下门窗时抛错且原设计不变。

## Verification checklist

- [ ] `pnpm test`（vitest，范围 `src/features/interior`）全绿，含 `dimensionWallEdit.test.ts` 回归与新增 `roomSides.test.ts`。
- [ ] `pnpm check`（`eslint .` + `tsc --noEmit`）无新增 error。
- [ ] `pnpm run build` 通过。
- [ ] 正向：空白户型加一道隔墙 → 选中房间 → 工具条「尺寸」列出 4~6 条边，读数与画布量取一致；改某边长度，画布与 3D 立即变化，失焦后 `Ctrl+Z` **一步**回到原尺寸。
- [ ] 正向：同一次改动在右侧面板「房间尺寸」中同步显示；面板改、工具条也同步（同一份数据）。
- [ ] 负向 / 默认：打开弹层不动任何值直接关闭 → 设计无变化、撤销栈无新增（`sizeTransaction` 的 `apply` 在未 `update` 时不 commit）。
- [ ] 负向：外侧是承重墙 / 参考户型未解锁 / 开敞自由边的那些行列出了长度并显示锁定原因，输入框不可编辑；参考户型整体提示「复制该项目后副本可自由调整」。
- [ ] 负向：把边改到会穿过其他墙、使连接墙反向或容不下门窗时，画面不变并给出行内原因。
- [ ] 边界：最小值 0.1 m、最大值 100 m 生效；0 / 负数 / 100.01 被拒绝并提示；输入与当前完全相同的值不产生撤销步。
- [ ] 边界：L 形房间（房间 4 这类 6 条边）序号正确、共线的墙段被合成一条边；DXF 导入的斜边显示为只读。
- [ ] 响应式：390 宽下工具条弹层与面板行均不溢出、步进按钮可点（用 `website_screenshot` 的 `mobile_390` 与 `desktop_1280` 各验证一次影响到的路由）。
