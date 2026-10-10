# AI 布局的确定性校验：门扇扫掠区 / 窗前区 / 过道 / 房间轮廓

## Context

用户反馈：AI 设计房间与整户布局时，约束里已经写明「家具不能跨房间」，模板也已经作为范例给了模型，但生成的方案仍然出现家具跨房间、家具压在门洞或门扇开启路径上、柜体遮挡窗户与阳台。

排查后确认**不是提示词写得不够，也不是模型能力问题，而是架构缺了最后一层校验**：

1. **模型看不到自己的结果。** 模型输出的是 `{code, back, along, gap}`（贴哪面墙、沿墙位置、离墙间距），**不输出坐标**。真实的 `x1/y1/x2/y2` 由后端 `footprint()`（`supabase/functions/interior-ai-design/index.ts:437`）反算。模型自检时手上没有可验算的数字，只能凭先验回答「通过」——这是必然，不是疏漏。
2. **门窗信息不足。** `AiRoomContext.openings`（`src/features/interior/ai/types.ts:46`）只带 `{kind, edge, along, width}`，没有 `hinge`、`swingSide`、`sill`、`height`。门窗开向与窗台高根本没发给模型，门扇扫掠区与「高柜挡窗」无从判断。
3. **校验项只有两项。** 后端 `checkItems()`（同文件 `:483`）只检查「占地是否超出房间外接矩形」与「家具两两重叠」。**压门洞、挡窗、挡过道、跨房间，代码里没有任何检查**，所以也不会出现在回灌给模型的 `hard`/`soft` 清单里。
4. **用外接矩形当房间。** `checkItems` 用 `zone`（外接矩形）判定越界，L 形房间的凹口被当成室内空间；整户模式（`:613`）更是直接拿每个房间的 bbox 当房间轮廓，家具越过内墙进邻居房间也检测不到。
5. **几何算法已存在但没接上。** `doorSwingPoints()`（`src/features/interior/model/doorOrientation.ts:10`）、`openingSill()` / `openingHeight()`（`model/hardMaterials.ts:67`）、`inRing()` / `pushOut()`（`model/geometry.ts:50`、`:221`）、`fitFurnitureIntoRoom()`（`model/roomFit.ts:44`）都是现成的，只是校验链路没调用。

**为什么不用 Agent：** Agent 拿到的是同一份盲数据（无坐标、无开向、无窗台高），换一个执行体不会多出可验算的信息。缺的是确定性几何校验，不是更会推理的模型。后端的 repair 循环（`interior-ai-design/index.ts:737`，`repair_rounds` 默认 1、上限 3）已经具备「把错误清单回灌给模型重生成」的能力，只要把缺的校验项补进去即可。

**目标：** 让「压门洞 / 挡窗 / 挡过道 / 跨房间」变成可计算的硬约束，先由模型在 repair 轮里修，修不掉则由确定性几何校正兜底，用户最终看到标注「已自动微调 N 处」，而不是一个压着门的方案。

---

## 设计要点

### 一、补足请求数据（前端 → 后端）

| 字段 | 现状 | 改为 |
| --- | --- | --- |
| `AiCatalogEntry.height` | 无 | 新增 `height: number`：`item.height ?? 按类型默认高度`。衣柜/书柜/冰箱/高柜约 2000、床 500、桌面 750、床头柜 550、灶台/水槽 900、矮柜 900、地毯 20。目录里 `LibraryItem.height` 是可选字段（`model/types.ts:219`），内置 catalog 无该字段，因此默认高度表放在前端一处生成，后端只读 `e.height` 做比较，不再各自维护一份类型表 |
| `AiRoomContext.ring` | 无 | 新增房间净空轮廓 `Point[]`（已有 `room.ring`，直接透传），替代把 `zone` 外接矩形当房间 |
| `AiRoomContext.openings` | `{kind, edge, along, width}` | 增加 `hinge: 'start' \| 'end'`、`swingSide: -1 \| 1`、`sill: number`、`height: number`、`sliding?: boolean`。数据源是 `Opening`（`model/types.ts:16`）与 `openingSill()` / `openingHeight()` |
| `AiPlanSnapshot.rooms[]` | `ring` 已有 | 保持；同时给整户的每组家具带上该房间的 `ring`（`AiPlanRequest` 已含 `rooms`）|

门的开向必须进提示词，否则模型仍无法自查——`PLANNING_RULES:170` 已经要求「平开门按铰链侧与开向检查门扇扫掠区」，但没有数据可查，这条规则目前是空转。

### 二、后端确定性校验（`supabase/functions/interior-ai-design/index.ts`）

新增一个可复用的保留区（keep-out）构造器，供四项检查共用：

```
keepOutsFor(room, openings) -> { polygon: Point[]; kind: 'doorSweep' | 'doorway' | 'window'; tallOnly: boolean; label: string }[]
```

- **门扇扫掠区（doorSweep）**：平开门以铰链点为圆心、`width` 为半径，在 `swingSide` 一侧取四分之一圆多边形（13 段折线，与前端 `doorSwingPoints` 同一构造）。推拉门替换为沿墙的滑动带（洞口范围内、向房内 `width` 深的条带）。`kind === 'passage'`（垭口）无门扇，只做洞口通行带。折叠门未知时按 `信息不足` 记录，不假称已检查。
- **门洞通行带（doorway）**：洞口全宽 × 房内 300mm 深的矩形。这是最基础的「能走到门口」，任何家具（含地毯）都不得占用。
- **窗前区（window）**：洞口全宽 × 房内 600mm 深的矩形，`tallOnly: true`——仅对 `e.height >= 1200` 的家具报违规（矮柜、书桌、飘窗垫允许作为窗下布置，与 `PLANNING_RULES:177` 一致）。窗台高参与判断：`sill >= 1900` 的高窗（如卫生间高窗）不产生保留区。

四项检查接入 `checkItems`：

1. **跨房间 / 出轮廓（hard）**：家具矩形四角用 `inRing` 逻辑（前端 `geometry.ts:50`）判定是否落在房间 `ring` 内。替换现有「bbox 越界」判断。整户模式（`:613`）同步改用 `rooms[].ring`，不再用 bbox。矩形跨出轮廓的边长 > 30mm 容差即报。
2. **压门洞 / 压扫掠区（hard）**：家具矩形与保留区多边形做相交面积计算。扫掠区是凸多边形，用 Sutherland–Hodgman 裁剪家具矩形后求面积，`> 5000 mm²` 报违规（地毯对 `doorway` 也报，对 `doorSweep` 不报）。报错文案带上可执行信息，例如 `门扇扫掠区被 F7（衣柜）占用 320×400 mm，请调整 along / gap`——回灌给模型的是可操作指令，而不是「请不要挡门」。
3. **挡窗 / 挡阳台门（hard）**：同上，`tallOnly` 过滤后判相交。
4. **堵过道（soft）**：房间按 100mm 栅格光栅化（6m 房间约 60×60 格），家具矩形（含 `doorway`/`doorSweep` 保留区）标记为占用格。以每个门的房内侧相邻格为起点做 BFS，检查：门与门之间可达；门口到房间内最大连通区可达；被占用后仍存在宽度 ≥ 600mm 的连通路径。不可达即报 `过道被 F3（餐桌）堵断，门口无法到达房间另一侧`。整户模式另检查每个房间至少一个门与入户门连通。

新增校验项全部计入 `Issues`（`hard` 触发 repair 重生成，`soft` 只提示）。`checkItems` 的签名从 `(items, zone, byCode, label, found)` 扩为带上 `ring` 与 `keepOuts`，房间模式与整户模式共用同一套逻辑。

### 三、确定性兜底（后端 → 前端）

模型可能连续几轮都修不掉（例如小房间放了大衣柜）。处理顺序：

1. repair 轮内由模型修（现有逻辑，`:737`）。
2. 轮次耗尽后，若仍有**可修复**的违规（非硬性结构错误），在**后端**执行确定性校正：按违规面积从小到大，用「沿墙滑动 → 加大 gap → 镜像到对侧墙 → 换到房间最长空墙」的顺序试探，取第一个不违反任何保留区且仍在 `ring` 内的位置。全部违规都能消解则接受该方案，返回 `warnings` 计数；存在无法消解项才返回 422 失败。
3. **前端落库前再做一次**（纵深防御，用户手动拖拽后同样生效）：扩展 `fitFurnitureIntoRoom()`（`model/roomFit.ts:44`），增加 `keepOuts` 参数，复用 `geometry.ts` 的 `pushOut()` 把家具推出保留区，超出 `ring` 的按现有逻辑夹回。`sanitize.ts` 的 `toSpec()` 已经带 `clearance` 参数，保留区从那里一并传入。
4. 候选卡片（`components/AiResults.tsx`）把 `warnings` 从纯数字改为可展开的简短说明（`已自动微调 2 处：衣柜避开门扇、餐桌让出过道`），让用户知道方案被动过，而不是静默改动。

---

## 关键文件

**后端**
- `supabase/functions/interior-ai-design/index.ts` — 新增保留区构造器与四项校验，改造 `checkItems` / `validateRoom` / `validatePlan`，接入确定性校正。注：后端是 Deno，无法 import `src/`，门扇扫掠多边形的构造需在后端实现一份（几何定义与前端 `doorSwingPoints` 保持一致）。

**前端**
- `src/features/interior/ai/types.ts` — `AiCatalogEntry.height`、`AiRoomContext.ring`、`AiRoomContext.openings` 扩展。
- `src/features/interior/ai/catalog.ts` — `buildAiCatalog` 输出 `height`（含按类型默认高度表）。
- `src/features/interior/ai/context.ts` — 组装请求时透传 `ring`、`hinge`、`swingSide`、`sill`、`height`。
- `src/features/interior/model/roomFit.ts` — `fitFurnitureIntoRoom` 增加 `keepOuts`。
- `src/features/interior/ai/sanitize.ts` — `toSpec` / `sanitizeRoomItems` 传递保留区。
- `src/features/interior/ai/apply.ts` — 落库时调用带保留区的校正。
- `supabase/functions/interior-ai-design/index.ts` → `PLANNING_RULES` / `ROOM_CONTRACT` — 提示词补一句「门窗的铰链侧、开向、窗台高已在目标房间数据中给出，必须逐项核对」；`ROOM_CONTRACT` 的「输出前请逐件核对」保留，因为有了真实数据后它才成为可执行的要求。

**复用（不新写）**
- `model/geometry.ts`：`inRing`、`pushOut`、`aabb`、`snapToStep`、`ringArea`
- `model/doorOrientation.ts`：`doorOrientation`、`doorSwingPoints`
- `model/hardMaterials.ts`：`openingSill`、`openingHeight`、`defaultOpeningSize`
- `model/roomFit.ts`：`footprintCorners`、`fitsInRoom`
- `model/roomRegions.ts`：`openRing`、`netArea`
- 后端既有：`footprint`、`Issues`、`tuckedSeat`、`insetOnCounter`、repair 循环

---

## 实施清单

- [ ] `AiCatalogEntry` 增加 `height`；`buildAiCatalog` 用 `item.height ?? 类型默认高度` 填充
- [ ] `AiRoomContext` 增加 `ring`、`openings[].hinge / swingSide / sill / height / sliding`
- [ ] `ai/context.ts` 组装请求时透传上述字段（数据源：`Opening`、`openingSill`、`openingHeight`）
- [ ] 后端实现 `keepOutsFor(room, openings)`，产出 `doorSweep` / `doorway` / `window` 三类保留区多边形
- [ ] `checkItems` 改用房间 `ring`（`inRing` 逻辑）判定越界，替换现有 bbox 判定
- [ ] `validatePlan` 的每组家具改用 `rooms[].ring` 而非 bbox
- [ ] 新增保留区相交校验：门扇扫掠区（> 5000 mm²）、门洞通行带、窗前区（仅 `height >= 1200`）
- [ ] 新增过道连通性校验：100mm 栅格 + BFS，报出堵断家具的代号与名称
- [ ] `PLANNING_RULES:173` 的「门型未知不得声称已检查」落到实现：折叠门/未知门型记为「信息不足」而非通过
- [ ] repair 轮耗尽后执行后端确定性校正（滑动 → 加 gap → 镜像 → 换墙），必要时才 422
- [ ] `fitFurnitureIntoRoom` 增加 `keepOuts`，复用 `pushOut`
- [ ] `sanitize.ts` / `apply.ts` 传入保留区，落库前做前端校正
- [ ] `AiResults.tsx` 的 `warnings` 展示为可展开的具体说明
- [ ] 提示词补充「门窗开向与窗台高已在数据中给出，需逐项核对」

## 验证清单

- [ ] 单测：L 形房间放入横跨凹口的家具 → 报跨房间/出轮廓（现有 bbox 判定会漏过，新逻辑必须捕获）
- [ ] 单测：衣柜落在平开门扇扫掠区内 → 报 hard 违规，文案含代号与占用尺寸
- [ ] 单测：推拉门不产生四分之一圆扫掠区，改为滑动带
- [ ] 单测：`height 2000` 的衣柜压在窗洞前 → 报违规；`height 750` 的书桌在同一位置 → 不报
- [ ] 单测：`sill >= 1900` 的高窗不产生窗前保留区
- [ ] 单测：餐桌堵断门口到房间另一侧的通道 → 报 soft 违规，且 600mm 通道保留时不报
- [ ] 单测：`kind === 'passage'` 垭口不产生门扇扫掠区，仅门洞通行带
- [ ] 单测：确定性校正能把压门扇的衣柜移到同墙合法位置，且校正后不产生新的重叠
- [ ] 单测：校正无法消解时返回 422，不返回带违规的方案
- [ ] 单测：前端 `fitFurnitureIntoRoom` 带 `keepOuts` 时把家具推出扫掠区且不越出 `ring`
- [ ] 回归：`pnpm test` 全绿（重点 `src/features/interior/model/roomFit`、`doorOrientation`、`validation`、`src/features/interior/ai/*.test.ts`）
- [ ] 回归：`pnpm run build` 通过
- [ ] 手工：房间模式（小卧室放 2m 衣柜 + 平开门）生成 2 个候选，确认无压门扇、无挡窗，`warnings` 说明与实际改动一致
- [ ] 手工：整户模式生成，确认无家具越过内墙进入相邻房间
- [ ] 手工：用户手动把家具拖到门扇上并保存，前端校正生效并提示
