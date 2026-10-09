# AI 户型：贴墙家具与墙面之间那条 60 mm 的缝

## Context

用户反馈：AI 生成的整户方案里，「应该贴墙放」的家具（沙发、橱柜、衣柜、床、洗衣池、马桶…）现在都离墙一点点。截图（image 237）里红箭头指的就是三人沙发背面与墙之间的缝。

**真实数据核对**（读 `interior_ai_candidates`，截图对应的是 `b97e9d4f-5ad4-40f0-8e57-f5140db610cb` / idx 1「保留原图双卧格局，强化全屋收纳」）：

- 贴墙家具的 `gap` 几乎全是 **60**（= `INNER_WALL / 2`，内墙厚 120 的一半）：橱柜台面、水槽、燃气灶、冰箱、玄关柜、三人沙发、单人床、衣柜、床头柜、书架、淋浴房、马桶、浴室柜、梳妆台、洗衣机、洗衣池、储物柜；主卧的床与床头柜是 **150**。
- 房间内部件才是大数：餐边柜 1200、餐桌 900、餐椅 350、茶几 1500、电视柜 2900。
- 对照组：**房间布局（room 模式）** 的候选里，同一类贴墙家具模型给的是 `gap: 0`。

**根因（坐标系差半个墙厚）**：

- plan 契约让模型「沿墙中心线」给房间轮廓，而家具坐标写的是「相对该房间外接矩形的左上角」；模型为了让家具背面落在墙**面**（而不是中心线）上，自然留出半个内墙厚 60 mm。
- 但 `sanitizePlan` 会先把房间轮廓用 `netRing` 向内收 `INNER_WALL / 2`（60）算出**净空** ring，再取其 `boundsOf` 作为家具摆放 zone（`sanitize.ts:249`），`placeFurniture` 按净空 zone 摆放（`floorplanBuilder.ts:284`）。两套坐标系相差正好半个墙厚 → 模型留的 60 mm 就成了净空里一条 60 mm 的缝（外墙边也照留，因为模型对每条边都用同一个「半墙厚」）。
- room 模式没有这个问题：`roomContext` 直接把**净空** zone 的绝对坐标交给模型，契约也写「gap：家具背面到这条边的净距；贴墙为 0」，所以模型给 0。

## 方案

### 1. 前端按净空重算 gap — `src/features/interior/ai/sanitize.ts`

- `toSpec(raw, zone, catalog, clearance = 0)`：`gap` 先用 `clearance` 平移再夹取：

```ts
// 模型按房间中心线矩形给 along/gap：贴墙时它会为半个墙厚留 60 mm。
// 系统按净空矩形摆放（房间轮廓已向内收半个内墙厚），所以要扣掉这半个墙厚：
// 贴墙的 60 变成 0，按契约给的 0 也仍是 0；模型想留的真实缝隙（150 → 90）保留。
const gap = round10(clamp((num(raw.gap) ?? 0) - clearance, 0, Math.max(0, horizontal ? y2 - y1 : x2 - x1)));
```

- `sanitizePlan` 调用处传 `INNER_WALL / 2`（复用 `floorplanBuilder` 已导出的常量，不写死 60）。
- `sanitizeRoomItems` 保持 `clearance = 0`：room 模式的 zone 本身就是净空、契约写明是净距，实测模型给 0，不能误削它真实的间隙。
- `along` 的 60 mm 原点偏移（模型按中心线矩形量、系统按净空量）**不改**：最多把家具沿墙挪 60 mm，看不出来；要改就得把「这条边有没有墙、墙多厚」传进 `toSpec`，收益不成比例。

### 2. 契约写清坐标系，从源头不再留缝 — `supabase/functions/interior-ai-design/index.ts`

- `PLAN_CONTRACT` 末尾的家具段由「…坐标相对该房间外接矩形的左上角。」改为：

> 家具：按房间分组，room 引用房间 id。每件家具用 back（背靠哪条边：up/down/left/right）、along（中心沿这条边的位置）、gap（背面到这条边的距离，贴墙为 0）描述，坐标相对该房间**净空矩形**（房间轮廓向内收半个墙厚后的可用范围）的左上角；贴墙摆放时 gap 必须为 0，不要为墙厚留空隙，也不要把家具压到墙上。只能用目录里的代号。

- 改完重新部署这个后端函数（前端调用方式不变）。工作区当前是干净状态，部署不会带上别人的半成品改动。

### 3. 测试 — `src/features/interior/ai/ai.test.ts`

沿用现有 `plan` fixture 与 `codeOf`，并复用 `ai/context.ts` 的 `roomZone`、`ai/apply.ts` 的 `planToDesign` 断言真实落点。

## 关键文件

- 修改：`src/features/interior/ai/sanitize.ts`（`toSpec` 增加 `clearance`；`sanitizePlan` 传 `INNER_WALL / 2`）
- 修改：`src/features/interior/ai/ai.test.ts`（新增用例）
- 修改并重新部署：`supabase/functions/interior-ai-design/index.ts`（仅 `PLAN_CONTRACT` 文案）
- 复用不改：`floorplanBuilder.ts` 的 `placeFurniture` / `INNER_WALL` / `netRing`、`ai/context.ts` 的 `roomZone`、`model/costs.ts` 的 `normalizeFurniture`、`ai/apply.ts` 的 `planToDesign`

## Implementation checklist

- [ ] `sanitize.ts`：`toSpec` 增加 `clearance` 参数（默认 0），`gap` 改为 `clamp(raw - clearance, 0, 分区尺寸)` 后再 `round10`
- [ ] `sanitize.ts`：`sanitizePlan` 的家具映射传 `INNER_WALL / 2`；`sanitizeRoomItems` 仍传 0（保持 room 模式行为）
- [ ] `sanitize.ts`：注释说明「模型 gap 量到墙中心线、系统按净空摆放」的换算，并给出 60→0 / 0→0 / 150→90 三个结果
- [ ] `index.ts`（后端函数）：`PLAN_CONTRACT` 家具段改为「净空矩形 + 贴墙 gap 必须为 0 + 不要压墙」
- [ ] `ai.test.ts`：新增 plan 用例——`gap: 60` 的房间贴墙家具落地后背面正好落在 `roomZone` 对应边上（缝为 0）
- [ ] `ai.test.ts`：新增 plan 用例——`gap: 150` → 90、`gap: 0` → 0、负值/超界仍夹进分区
- [ ] `ai.test.ts`：新增 room 用例——`sanitizeRoomItems` 的 `gap` 不平移（0→0、1500→1500）
- [ ] 部署后端函数 `interior-ai-design`

## Verification checklist

- [ ] 正向：`pnpm exec vitest run src/features/interior` 全绿（含新增用例；`整户户型候选清洗与落地`、`房间布局候选清洗与落地` 的既有断言不变）
- [ ] 正向（真实数据）：对 `interior_ai_candidates` 里 plan 候选的家具逐件换算「背面到最近墙面」的距离，`gap: 60` 的条目全部由 60 变为 0，`gap: 150` 的变为 90，房间内部件（900/1200/1500/2900）只少 60，量级不变
- [ ] 正向（端到端脚本）：把一条真实候选 payload 的 `catalogId` 经 `buildAiCatalog` 反映射回 code 后跑 `sanitizePlan` + `planToDesign`，打印每件家具背面到所属房间净空边的距离，确认不再出现 60 mm 的缝（临时脚本，验证后删除，不留在仓库）
- [ ] 负向：`gap` 远大于分区尺寸（如 99999）、`gap` 为负、`along` 越界时仍夹进分区、件数不丢（现有「指定家具不因放不下而丢件」用例通过）
- [ ] 边界：`gap` 恰好 60 → 0；`gap < 60`（含 0 与负数）→ 0；外墙边（模型同样给 60）→ 0；room 模式 `gap` 不平移
- [ ] 回归：`pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm run build` 通过
- [ ] 部署：`supabase_deploy_edge_function interior-ai-design` 成功
- [ ] 未验证则如实说明：契约改动要真实跑一批 AI 生成才能确认模型已按 `gap: 0` 输出（我无法在界面上触发生成），因此只把它当作「源头修正」，确定性修复由第 1 步的净空换算保证
