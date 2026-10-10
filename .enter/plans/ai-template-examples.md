# 把算法模板作为范例传给 AI（few-shot）

## Context
现在 AI 生成户型/房间布局只靠系统规则（PLANNING_RULES、PLAN_CONTRACT 等），模型对坐标、墙中心线、净空、家具 back/along/gap 的理解经常偏差，规则写得再严也拦不住。

项目里已经有 5 套**算法生成**的模板（`templatePresets.ts` 里的 `apartment()` + `templateFurniture.ts`：阳光小筑 / 悦居两房 / 温暖三房 / 阔境四房 / 通透横厅）。它们的中间产物 `PlanSpec`（walls / openings / rooms / furniture 的 back/along/gap）和 AI 要输出的 JSON **几乎是同一种格式**。

做法：不传算法源码（模型从代码里学不准），而是在每次请求时把这 5 套模板**按 AI 输出约定序列化成标准答案 JSON**，作为「需求 → 正确输出」的范例一起发给模型：
- 整户生成：5 套完整范例（需求描述 + 完整 JSON）。
- 单房间布局：按目标房间类型（卧室/卫生间/厨房/客餐厅/阳台/玄关）从模板里挑最接近的 2–3 个同类房间范例。

范例由前端在发请求时现算：家具代号（F1…Fn）是每次请求按目录现分配的，只有前端能把模板家具对上代号；模板改了，范例自动同步，不用维护第二份。

「原木之家」参考户型是手绘的墙体矩形数据，不是 `PlanSpec` 格式，转换会失真，本次不放进范例。

## 方案

### 1. 模板暴露 PlanSpec
`src/features/interior/data/templatePresets.ts`
- `TemplatePreset` 增加可选 `spec?: () => PlanSpec`；5 套算法模板填上 `spec: () => apartment(...)`，`build` 改为 `buildPlan(spec())`，行为不变。
- `templates.ts` 的 `TEMPLATE_PRESETS` map 时保留 `spec` 字段。

### 2. 新建范例序列化模块 `src/features/interior/ai/examples.ts`
- `planExamples(catalog: AiCatalog): AiPlanExample[]`：对每个带 `spec` 的模板输出
  `{ requirement: "三室两厅一卫，长 11.4 m × 宽 9.3 m；三代同住 · 动静分区 · 南向客厅", output: {summary, width, depth, walls, rooms, openings, furniture} }`
  - walls / openings 直接取 `PlanSpec`（openings 去掉 `hinge`，契约要求用户没说就不输出）。
  - rooms：模板房间 box 是净空（已向内收半墙厚），按契约转回**墙中心线**：不在外轮廓上的边向外扩 `INNER_WALL/2`。
  - furniture：按 zone 与房间 box 对应得到 `room` id；每件家具用 `libraryResolver` 找到素材 → `catalog.codeOf(catalogIdOf(item))` 得代号，只保留 `code/back/along/gap`。
  - 模板里带 `w/d` 覆盖尺寸的家具（台面、电视柜、餐桌等）：在目录同 type 内选尺寸最接近的条目。
  - 自检过滤：按目录尺寸算占地，越出 zone 或与其他家具非法重叠的件从范例里剔除（规则与后端 `checkItems` 一致：地毯、椅子收进桌下、灶台/水槽嵌在台面内不算重叠），保证范例本身就是「能通过校验的正确答案」。
- `roomExamples(catalog, room: AiRoomContext, limit = 3): AiRoomExample[]`：按房间名关键词归类（卧/卫浴/厨/客餐/阳台/玄关过道），用 `designForTemplate` 建出模板方案，取同类房间的 `roomContext()`（zone 尺寸 + 门窗 edge/along，和真实请求格式一致）+ 该房间家具 items，按 zone 尺寸与目标房间最接近排序取前 `limit` 个；zone 归一为相对坐标 `[0,0,宽,深]`。没有同类时返回空数组。

### 3. 请求带上范例
- `src/features/interior/ai/types.ts`：新增 `AiPlanExample`、`AiRoomExample` 类型。
- `src/features/interior/ai/client.ts`：`AiRequestBase` 增加 `examples?: unknown[]`。
- `src/features/interior/components/AiCreateProjectDialog.tsx`：`generatePlanCandidate` 传 `examples: planExamples(aiCatalog)`（在 `send` 内算一次，同一批共用）。
- `src/features/interior/ai/useRoomAi.ts`：`generateRoomCandidate` 传 `examples: roomExamples(catalog, roomContext)`。

### 4. 后端使用范例 `supabase/functions/interior-ai-design/index.ts`
- `Body` 增加 `examples?: unknown[]`；`guard` 校验：数组、plan ≤ 6 条 / room ≤ 4 条、每条 JSON ≤ 20 000 字符。
- 新增 `examplesText(b)`，插在 `planPrompt` / `roomPrompt` 的「家具目录」之后、「用户需求」之前：
  「参考范例（由系统算法生成并通过校验的标准答案，坐标约定、墙中心线、房间轮廓、门窗、家具 back/along/gap 与代号用法都完全正确）。学习它们的输出格式、尺寸尺度和家具摆法；**不要照抄**范例的房间数量、尺寸和布局，一切以下面的用户需求为准。」+ 每条「需求：… / 输出：{JSON}」。
- `checkItems` 增加一条允许重叠：`stove`、`ksink` 完全落在 `counter` 占地内不算碰撞（与规划原则「桌面物品可以落在承托面上」一致，否则模型照范例把灶台嵌进台面会被判冲突）。
- 部署 `interior-ai-design` 后端函数。

## 不改动
系统规则文本、模型列表、修复轮逻辑、`sanitizePlan` / `planToDesign` 的落地逻辑、模板本身的外观与家具。

## Implementation checklist
- [x] `templatePresets.ts`：`TemplatePreset.spec` 可选字段，5 套算法模板提供 `spec()`，`build()` 结果与改动前一致
- [x] `templates.ts`：`TEMPLATE_PRESETS` 保留 `spec`
- [x] `ai/examples.ts`：`planExamples()` 输出 5 条，房间 box 为墙中心线坐标，家具只含 `code/back/along/gap`，无 `hinge`
- [x] `ai/examples.ts`：覆盖尺寸家具映射到同 type 最近尺寸条目；越界 / 非法重叠件被剔除
- [x] `ai/examples.ts`：`roomExamples()` 按房间类别返回 ≤ 3 条，含 zone 尺寸、门窗、items；无同类返回 `[]`
- [x] `ai/types.ts`、`ai/client.ts`：新增范例类型与 `examples` 字段
- [x] `AiCreateProjectDialog.tsx` 与 `useRoomAi.ts` 发送 `examples`
- [x] 后端 `guard` 校验 `examples` 数量与大小，超限返回 400 中文提示
- [x] 后端 `planPrompt` / `roomPrompt` 在目录后、用户需求前插入范例段落与「不要照抄」说明
- [x] 后端 `checkItems`：stove / ksink 完全在 counter 内不报重叠
- [x] 部署 `interior-ai-design`

## Verification checklist
- [x] 新增 `ai/examples.test.ts`：
  - 正向：`planExamples(buildAiCatalog())` 返回 5 条；每条经 `sanitizePlan` + `planToDesign` 成功，房间数与模板一致
  - 正向：所有家具代号都能在目录 `byCode` 中找到；每件家具占地在所属房间 zone 内，且无非法重叠
  - 边界：房间 box 贴外轮廓的边保持 0 / width / depth，内墙侧边比净空 box 外扩 60
  - 正向：`roomExamples` 对「主卧」返回卧室范例、对「厨房」返回厨房范例；负向：对「储藏间」返回 `[]`
  - 负向：目录里没有某 type 时，该件被跳过而不是抛错
- [x] `templatePresets.test.ts` / `templateAutoMerge.test.ts` 仍通过（`build()` 不变）
- [x] `pnpm vitest run src/features/interior/ai src/features/interior/data`
- [x] `pnpm tsc --noEmit` 与 `pnpm run build`
- [ ] 部署后在预览里用默认需求「AI 创建户型」生成 2 个方案、对一个卧室做「AI 布局」，查看后端日志里首轮 hard/soft 问题数，确认请求未超限、方案可正常创建
