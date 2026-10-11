# AI 布局校验：背靠实墙 / 门扇扫掠区 / 窗前区 / 过道 / 房间轮廓

## Context

用户反馈三类问题，共同点是**方案几何上放得下，住起来不成立**：

**(1) 背靠面悬空（本次核心，用户最新澄清）**：客厅有很多面，其中一面朝阳台、是开间（垭口或矮墙栏板）。AI 把电视柜摆在靠阳台那一侧，**背后根本没有墙**。用户原话：「它连后面的那个墙都没有」。

根因：模型输出的 `back: up/down/left/right` 只是「分区矩形的哪条边」，而**没有任何数据告诉模型那条边背后有没有实体墙**。后端 `footprint()`（`supabase/functions/interior-ai-design/index.ts:437`）与前端的 `placeFurniture()`（`data/floorplanBuilder.ts:284`）都只是把家具贴到分区矩形的边线上——那条线是阳台开间时，家具照样贴上去，几何上合法，现实中悬空。提示词第 148 行只写了「壁挂物品必须有明确安装面」，**没有任何代码校验背靠面是否存在**。

> 注：上一版把这里误判成「家具与房间功能不匹配」（阳台房间放电视柜）。经用户澄清，真正的问题是**背靠实墙**，房间功能匹配不在本次范围。

**(2) 门窗几何违规**：约束里已写明「家具不能跨房间」，模板也已作为范例给模型，但方案仍出现家具压在门洞或门扇开启路径上、柜体遮挡窗户与阳台。

**(3) 跨房间与越轮廓**：家具越过内墙进入相邻房间；L 形房间的凹口被当成室内空间。

后两类是**同一类根因**：模型自检时手上没有可验算的数据，而后端校验项太少。确认**不是提示词写得不够，也不是模型能力问题，而是架构缺了最后一层校验**：

1. **模型看不到自己的结果。** 模型输出 `{code, back, along, gap}`，**不输出坐标**；真实占地由 `footprint()` / `placeFurniture()` 反算。模型自检时没有数字可验，只能凭先验答「通过」。
2. **关键信息没发出去。** `AiRoomContext`（`ai/types.ts:46`）只带 `zone`（外接矩形）+ `openings`（`{kind, edge, along, width}`）：**没有**「哪条边背后是实墙/矮墙/开间」，也**没有** `hinge`、`swingSide`、`sill`、`height`。背靠面、门扇扫掠区、遮挡窗洞三类检查全都无从判断。
3. **校验项只有两项。** 后端 `checkItems()`（同文件 `:483`）只检查「占地是否超出房间外接矩形」与「家具两两重叠」。**背靠面、压门洞、挡窗、挡过道、跨房间，代码里没有任何检查**，自然也不会出现在回灌给模型的 `hard`/`soft` 清单里。
4. **用外接矩形当房间。** `checkItems` 用 `zone` 判越界，L 形凹口被当成室内；整户模式（`:613`）直接拿每个房间的 bbox 当轮廓。
5. **几何算法已存在但没接上。** `roomSides()`（`model/roomSides.ts:90`）逐边给 `axis/at/start/end/facing`；`roomDerive.ts:31` 已有「点是否落在墙体中线 `thickness/2 + 2` 范围内」的判墙写法；`doorSwingPoints()`（`model/doorOrientation.ts:10`）、`openingSill()` / `openingHeight()`（`model/hardMaterials.ts:67`）、`inRing()` / `pushOut()`（`model/geometry.ts:50`、`:221`）都是现成的，只是校验链路没调用。

**为什么不用 Agent：** Agent 拿到的是同一份盲数据（无背靠面、无坐标、无开向、无窗台高），换一个执行体不会多出可验算的信息。缺的是确定性几何校验，不是更会推理的模型。后端已有 repair 循环（`:737`，`repair_rounds` 默认 1、上限 3）能把错误清单回灌给模型重生成，只需把缺的校验项补进去。

**目标：** 让「背靠面悬空 / 压门洞 / 挡窗 / 挡过道 / 跨房间」变成可计算的硬约束：模型第一轮就有数据可依，repair 轮把违规回灌给它修，修不掉则由确定性几何校正兜底，用户最终看到明确的「已自动微调 N 处」，而不是一个电视柜悬在阳台口的方案。

---

## 设计要点

### 一、补足请求数据（前端 → 后端）

| 字段 | 现状 | 改为 |
| --- | --- | --- |
| `AiRoomContext.edges` | **无** | **新增（本次核心）**：分区矩形四条边背后的实体分段 `{ side: AiEdge; spans: { from: number; to: number; kind: 'wall' \| 'low' \| 'open' \| 'outside' }[] }[]`。坐标与 `along` 同一套（相对分区矩形左上角）。`wall` = 有非矮墙实体墙；`low` = 矮墙 / 阳台栏板；`open` = 属于房间边界但背后无墙（开间、垭口、分隔线、纯玻璃）；`outside` = 该段不属于房间边界（L 形凹口） |
| `AiRoomContext.ring` | 无 | 新增房间净空轮廓 `Point[]`（已有 `room.rings[0]`，直接透传），替代把 `zone` 外接矩形当房间 |
| `AiRoomContext.openings` | `{kind, edge, along, width}` | 增加 `hinge: 'start' \| 'end'`、`swingSide: -1 \| 1`、`sill: number`、`height: number`、`sliding?: boolean`。数据源是 `Opening`（`model/types.ts:16`）与 `openingSill()` / `openingHeight()` |
| `AiCatalogEntry.height` | 无 | 新增 `height: number`：`item.height ?? 类型默认高度`（衣柜 / 书柜 / 冰箱 / 高柜约 2000，床 500，桌面 750，地毯 20）。`LibraryItem.height` 是可选字段（`model/types.ts:219`），内置目录无值，因此默认高度表在前端生成一次，后端只读 `e.height` 比较 |
| `AiPlanSnapshot.rooms[]` | `ring` 已有 | 保持；整户模式每组家具带上该房间的 `ring` 与 `edges`（整户模式的墙由模型自己输出，`edges` 由后端按输出结果计算，不需要前端发送） |

### 二、背靠实墙校验（本次核心）

**判定函数**（新建 `model/backing.ts`，前端唯一来源；后端 Deno 无法 import `src/`，需在后端保留一份同定义副本并在两侧注释标注同步点）：

- `backSpans(d, room)`：逐条分区边（up/down/left/right）按 ≤100mm 采样，逐样点判定属于 `wall` / `low` / `open` / `outside`，再合并成区间。判墙复用 `roomDerive.ts:31` 的既有写法：样点到任一「未拆除且 `kind !== 'low'`」墙体中线的距离 ≤ `w.thickness / 2 + 2`。
- `backCoverage(d, faceSegment, gap)`：给定背靠面线段，返回被 `wall` 覆盖的比例。背靠面线段按 `back` 取向决定长度：`up` / `down` 取长 `w` 的边，`left` / `right` 取长 `d` 的边；容差 200mm（覆盖 `gap` 预留的走线缝）。

**校验规则：**

- 覆盖比例 < 70% → 违规，文案可执行：`F7（电视柜）背靠「下」边，那一侧没有实墙（阳台开间），不能作为背靠面；请改靠有实墙的边或沿边移到有墙的位置`。
- **强制类型常量** `BACK_REQUIRED_TYPES`（单点定义，便于以后调整）：柜类 `wardrobe / bookshelf / shoecab / cabinet / tvstand / fridge / ovencol` + 壁挂类 `tv / acwall / waterheater` + 柜机 `aircon`。
- **矮墙不算实墙**（按用户选择）：`kind: 'low'` 的阳台栏板不计入 `wall`。
- 沙发 / 床 / 床头柜 / 书桌 / 梳妆台 / 浴室柜等只**提示**（`soft`），不强制——沙发背面留通道是常见做法。
- **设计中没有任何可判定的墙时跳过**，记为「信息不足」，不误报（与 `PLANNING_RULES` 第十四条的自检纪律一致）。
- 归入 `soft` 而非 `hard`：让模型在 repair 轮收到并修正，同时保证「修不掉也能靠确定性校正兜底」，不会因一件柜子把整个方案判失败。

### 三、门窗与轮廓的确定性校验（`supabase/functions/interior-ai-design/index.ts`）

新增可复用的保留区（keep-out）构造器，供四项检查共用：

```
keepOutsFor(room, openings) -> { polygon: Point[]; kind: 'doorSweep' | 'doorway' | 'window'; tallOnly: boolean; label: string }[]
```

- **门扇扫掠区（doorSweep）**：平开门以铰链点为圆心、`width` 为半径，在 `swingSide` 一侧取四分之一圆多边形（13 段折线，与前端 `doorSwingPoints` 同一构造）。推拉门替换为沿墙滑动带（洞口范围 × 向房内 `width` 深的条带）。`kind === 'passage'`（垭口）无门扇，只做洞口通行带。折叠门等门型未知时记「信息不足」，不假称已检查。
- **门洞通行带（doorway）**：洞口全宽 × 房内 300mm 深，任何家具（含地毯）不得占用。
- **窗前区（window）**：洞口全宽 × 房内 600mm 深，`tallOnly: true`——仅对 `e.height >= 1200` 报违规（矮柜、书桌、飘窗垫允许做窗下布置，与 `PLANNING_RULES:177` 一致）；`sill >= 1900` 的高窗不产生保留区。
- **跨房间 / 出轮廓**：家具矩形四角用 `inRing` 逻辑判定是否落在 `ring` 内，替换现有 bbox 判定；整户模式（`:613`）同步改用 `rooms[].ring`。跨出 > 30mm 容差即报。
- **压门洞 / 压扫掠区**：家具矩形与保留区多边形求相交面积（凸多边形用 Sutherland–Hodgman 裁剪后求面积），`> 5000 mm²` 报违规；地毯对 `doorway` 报、对 `doorSweep` 不报。
- **堵过道**：房间按 100mm 栅格光栅化，家具矩形与保留区标记占用格，以每个门房内侧相邻格为起点做 BFS；门口之间与「门口到房间最大连通区」不可达、或通道净宽 < 600mm 即报 `过道被 F3（餐桌）堵断`。整户模式另查每个房间至少一个门与入户门连通。

校验项全部计入 `Issues`（`hard` 触发 repair 重生成，`soft` 只提示）。`checkItems` 的签名从 `(items, zone, byCode, label, found)` 扩为带上 `ring`、`keepOuts`、`edges`，房间模式与整户模式共用同一套逻辑。

### 四、确定性兜底（后端 → 前端）

模型可能连续几轮都修不掉。处理顺序：

1. repair 轮内由模型修（现有逻辑，`:737`）。
2. 轮次耗尽后，在**后端**对残留的可修复违规执行确定性校正：
   - **背靠面违规**：① 沿同一条边滑到墙覆盖 ≥ 70% 的区段；② 换到相邻或对面有实墙的边（`back` 相应改变，`rot` 跟随），仍受保留区与其他家具约束；③ 仍不行 → 非指定家具丢弃并计入 `warnings`；指定家具 → 422 并指出冲突家具。
   - **门窗几何违规**：按违规面积从小到大，用「沿墙滑动 → 加大 gap → 镜像到对侧墙 → 换到该房间最长空墙」的顺序试探，取第一个不违反任何保留区且仍在 `ring` 内的位置。
3. 存在无法消解项才返回 422 失败；否则接受并返回 `warnings` 计数。
4. **前端落库前再做一次**（纵深防御，用户手动拖拽后同样生效）：扩展 `fitFurnitureIntoRoom()`（`model/roomFit.ts:44`）增加 `keepOuts` 与背靠面参数，复用 `geometry.ts` 的 `pushOut()` 把家具推出保留区、背靠面不足时移到有墙的区段；超出 `ring` 的按现有逻辑夹回。`sanitize.ts` 的 `toSpec()` 已带 `clearance` 参数，保留区与 `edges` 从那里一并传入。
5. 候选卡片（`components/AiResults.tsx`）把 `warnings` 从纯数字改为可展开的具体说明（`已自动微调 3 处：电视柜改靠有实墙的边、衣柜避开门扇、餐桌让出过道`），让用户知道方案被动过，而不是静默改动。
6. 手动把柜类 / 壁挂类拖到无墙一侧时，在属性面板给一条轻量提示（复用 `components/PanelHint.tsx` 的样式与 `PropertyPanel` 的既有容器），不阻断编辑。

---

## 关键文件

**新增**
- `src/features/interior/model/backing.ts` — `backSpans()` / `backCoverage()` / `BACK_REQUIRED_TYPES`，前端唯一来源。

**前端**
- `src/features/interior/ai/types.ts` — `AiCatalogEntry.height`、`AiRoomContext.ring`、`AiRoomContext.edges`、`AiRoomContext.openings` 扩展。
- `src/features/interior/ai/catalog.ts` — `buildAiCatalog` 输出 `height`（含按类型默认高度表）。
- `src/features/interior/ai/context.ts` — 组装请求时透传 `ring`、`edges`、`hinge`、`swingSide`、`sill`、`height`。
- `src/features/interior/model/roomFit.ts` — `fitFurnitureIntoRoom` 增加 `keepOuts` 与背靠面校正。
- `src/features/interior/ai/sanitize.ts` — `toSpec` / `sanitizeRoomItems` 传递保留区与 `edges`。
- `src/features/interior/ai/apply.ts` — 落库时调用带保留区与背靠面的校正。
- `src/features/interior/components/AiResults.tsx` — `warnings` 展示为具体说明。
- `src/features/interior/components/PropertyPanel.tsx` — 手动摆放的背靠面提示。

**后端**
- `supabase/functions/interior-ai-design/index.ts`：
  - 新增 `keepOutsFor()`、`backSpansOf()`（同定义副本）、`backCoverageOf()`，以及背靠面 / 保留区 / 连通性三类校验，改造 `checkItems` / `validateRoom` / `validatePlan`；
  - 接入确定性校正；
  - `PLANNING_RULES` 第四条补背靠面规则（衣柜、书柜、鞋柜、餐边柜、电视柜、冰箱、高柜必须背靠连续实墙，电视 / 挂机空调 / 热水器必须有安装墙面；不得背靠阳台开间、垭口、矮墙栏板、分隔线或大片玻璃；`wall` / `low` / `open` / `outside` 分段已给出，必须逐件核对）；
  - `LIVING_SENSE` 客厅一条补「电视柜要靠实墙，不能放在与阳台连通的开间一侧」；
  - 提示词补「门窗的铰链侧、开向、窗台高已在数据中给出，必须逐项核对」。

**复用（不新写）**
- `model/roomSides.ts`：`roomSides`、`normalizedOutline`、`facingOf`（逐边 `axis/at/start/end/facing`）
- `model/geometry.ts`：`inRing`、`pushOut`、`aabb`、`nearestOnWall`、`length`、`bbox`、`wallPoly`、`ringArea`、`snapToStep`
- `model/dimensionBinding.ts`：`faceGroup`（判断某条线的某位置有没有墙面）
- `model/doorOrientation.ts`：`doorOrientation`、`doorSwingPoints`
- `model/hardMaterials.ts`：`openingSill`、`openingHeight`、`defaultOpeningSize`
- `model/roomFit.ts`：`footprintCorners`、`fitsInRoom`
- `model/roomRegions.ts`：`openRing`、`netArea`
- `components/PanelHint.tsx`：手动提示的样式与关闭记忆
- 后端既有：`footprint`、`Issues`、`tuckedSeat`、`insetOnCounter`、repair 循环

---

## 实施清单

> 实施中的调整：判定逻辑统一放进 `model/layoutRules.ts`（不是计划里的 `backing.ts`）；背靠面改为按**房间轮廓的每条边**测量，不只看外接矩形四边，L 形房间的内凹墙也能正确判定。确定性校正只在前端做一次（房间模式、整户模式共用），后端只负责校验并把问题交给模型修。

- [x] `model/layoutRules.ts`：`roomEdges` 逐段探测每条轮廓边背后是 `wall / low / window / door / open`
- [x] `model/layoutRules.ts`：`backingOf` 返回实墙覆盖比例与主要非实墙构造；`BACK_REQUIRED_TYPES`（柜类 + 电视 + 冰箱 + 空调 + 热水器），沙发 / 床 / 桌椅不在其中
- [x] `model/layoutRules.ts`：`roomKeepOuts` 生成门口通行区（300）、门扇扫掠区（开向本房间才有）、窗前区（600，`sill >= 1900` 不生成）；垭口不生成扫掠区
- [x] `AiCatalogEntry.height`：`item.height ?? 类型典型高度 ?? 700`
- [x] `AiRoomContext` 增加 `ring / edges / keepOuts / doors`，窗带 `sill`；房间范例同步带 `edges`
- [x] 后端同定义的 `BACK_REQUIRED / clipArea / backingOf / passageBlocker`，两侧注释标注同步点
- [x] 后端房间模式读取前端测量；整户模式由 `planGeometry` 按模型输出的墙、房间、门窗现算
- [x] `checkItems` 在外接矩形检查之外增加轮廓 `ring` 检查；整户模式改用房间轮廓
- [x] 背靠面、保留区（> 5000 mm²，窗前区只限高度 ≥ 1200）、过道连通（100 mm 栅格，约 600 mm 通道）校验接入 repair 循环
- [x] 前端 `settleFurniture`：违规家具沿各条轮廓边找最近的合法位置；合规的不动；找不到位置的保留原位并标为待手动处理
- [x] `layoutRoom` / `planLayout` 落库前执行校正并返回说明
- [x] `AiResults` 改为可展开的「已自动微调 N 处 / M 处需要手动调整」列表（`AiLayoutNotes`）
- [x] 提示词：`PLANNING_RULES` 第四条、`LIVING_SENSE` 客厅条、`ROOM_CONTRACT` 的数据说明、`PLAN_CONTRACT` 第三节第 6 条
- [x] 属性面板 `BackingNote`：柜类 / 壁挂类落在没有实墙的一侧时提示，不阻断编辑
- [ ] 未做：推拉门滑动带（数据里没有推拉门类型）；折叠门「信息不足」标记；必选家具无法修正时返回 422（改为保留原位并提示）

## 验证清单

- [x] 单测：客厅与阳台之间是开间时，右侧整段为 `open`，左侧整段为 `wall`，窗段为 `window`
- [x] 单测：衣柜背靠开间一侧会报背靠违规；改靠实墙后不再报
- [x] 单测：沙发不要求背靠实墙
- [x] 单测：实墙覆盖 ≥ 70% 通过；背面离墙时覆盖率为 0
- [x] 单测：`height 2000` 衣柜压窗前区报违规，`height 750` 书桌不报
- [x] 单测：开向本房间的平开门产生扫掠区，压在里面的床头柜报违规，地毯不报
- [x] 单测：上下贯通的家具把两扇门隔开、或整块堵住门口时报出；只占一侧时不报；地毯不算挡路
- [x] 单测：校正把背靠开间的衣柜挪到实墙边并记录；合规家具不动；越出轮廓的家具收回房间
- [x] 后端冒烟：电视柜背靠阳台开间时，后端校验返回背靠违规；改靠实墙后无问题
- [x] 回归：`vitest src/features/interior` 共 95 个文件、812 个测试全部通过
- [x] 回归：`pnpm run build` 通过；`eslint` 没有错误；后端函数 strict 类型检查通过
- [ ] 手工：在真实的客厅加阳台开间户型上用 AI 生成方案，确认电视柜不再靠阳台一侧
- [ ] 手工：整户模式生成，确认没有家具越过内墙
