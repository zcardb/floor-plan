# AI 辅助生成户型 / 布局 / 家具（数据库 + Agent + 模型 + 弱入口 UI）

## Context

目前这个室内设计工具的「生成」全部是**离线确定性**的，没有任何 AI 参与：

| 环节 | 现在的做法 | 代码位置 |
| --- | --- | --- |
| 户型模板 | 4 个内置模板 + 1 个参考户型，参数化函数拼出来（`apartment()` 按 卧室数/服务区宽/进深 算墙位） | `data/templatePresets.ts`、`data/templates.ts` |
| 空白户型 | 一圈外墙 + 一个整块房间，长宽由用户输入 | `data/templates.ts: blankDesign` |
| 布局（内墙/门窗/房间） | 模板里手写墙体数组与开口数组 | `data/floorplanBuilder.ts: buildStructure` |
| 家具 | 每组房间用「靠哪面墙 + 沿墙位置 + 离墙距离」的简写硬编码，再按素材库尺寸解析成坐标 | `data/templateFurniture.ts`、`floorplanBuilder.ts: placeFurniture` |

`PlanSpec`（墙/开口/房间/家具分区）与 `FurnitureSpec`（背靠墙 + 沿墙位置 + 离墙距离）已经是一套**声明式 DSL**，`buildPlan()` 会做完整性校验。这正是最适合 AI 直接输出的目标格式：AI 只产出 DSL，几何计算、2D/3D 渲染、计价、导出全部复用现有代码。

本次按「**弱化 AI 入口**」做两处入口（不加常驻面板 / tab）：

1. **选中房间 → visual editor 工具条上的「AI 布局」**：点击弹出输入框（描述 + 参考图 + 模型 + 数量），生成完成后输入框原地换成候选方案，可「返回」重新输入，选中一个后 `应用` 生效。
2. **新建项目 → 新增「AI 创建」**：必填长宽 + 描述（可选媒体），弹窗内 loading 生成整户户型 + 门窗，一次出多张，选中一张确认后进入项目详情。

约束：家具只能从现有素材库 / 我的家具库中选（保证可计价、可 3D 渲染、可导出）；整户生成时外墙严格等于输入的长 × 宽（矩形），AI 只负责内墙分割、门窗与家具。

**关于「agent」的取舍**：本方案把 agent 落成两样东西 —— ① `interior_ai_agents` 表（可调的任务说明/风格偏好/模型/修复轮数，改配置不重新部署）；② 后端一个有界「生成 → 校验 → 修复」循环。硬性的 DSL 契约留在代码里（必须与渲染器一致）。若你指的是用 Builder 里的自定义 Agent 来承载提示词，那只需把 ② 的提示词来源换成自定义 Agent 调用，其余不变。

## 零、扩展性：家具目录 = 动态注册表 + 代号

**目标**：以后不管是往 `data/catalog.ts` 里加内置家具，还是用户在账号库新建家具，AI 生成时都**自动**能用，不改提示词、不改后端、不重新部署。

- **唯一来源**：新增 `ai/catalog.ts: buildAiCatalog({ design, accountFurniture })`，每次请求现算：`library`（内置）+ `design.customCatalog`（项目内）+ 账号家具库，按 `catalogId` 去重。新增的家具只要进了这三处之一，就会进入下一次生成。
- **代号**：每次请求给目录条目分配短代号 `F1…Fn`（按 `category → name` 稳定排序），连同 `name / category / type / w×d` 一起发给模型。模型**只引用代号**（`{ code:'F7', back:'up', along:1200, gap:0 }`），不再输出 `type/name`：省 token、杜绝模型编造家具名、同名家具（如两张不同「餐桌」）也能区分。
- **映射回家具**：请求时在前端保留 `code → catalogId → LibraryItem` 的映射表；返回后用它解析代号。解析不到的代号直接丢弃（后端校验也会把「未知代号」当错误让 agent 修一轮）。
- **后端不写死家具类型**：校验只看「代号是否在本次请求的目录里」，不像 `interior-furniture-image-submit` 那样维护 `allowed` 列表。
- **候选落库时存 `catalogId` 不存代号**：代号只在单次请求内有效，`interior_ai_candidates.payload` 里存解析后的 `catalogId`，日后目录变化仍可追溯。
- **新家具类型的渲染**：AI 只决定「放哪个 + 放哪」，2D/3D 形状仍按 `type`（`furnitureAppearance.ts`）渲染；账号家具的 `type` 已由新建家具弹窗决定，无需额外处理。

## 零点五、指定家具（房间布局）+ 统一家具选择器

**指定家具**：房间 AI 布局输入态新增「指定家具」动态列表：

- 「＋ 添加家具」每点一次，弹出家具选择器选一件，追加一行；行尾 `✕` 删除。
- **同一件家具可重复添加**（选过的仍在列表里可选），重复添加即表示数量（如两张床头柜）；列表按添加顺序展示，相同家具合并显示 `×2` 角标，删除时减一。
- 可选开关「只用指定家具」：开 = AI 只能用这些家具（数量必须一致）；关（默认）= 必须包含这些家具，其余可由 AI 从完整目录里补。
- 发送时把指定家具转成代号清单 `required: [{ code:'F7', count:2 }]`；后端校验「每个代号的出现次数 ≥ count（只用指定家具时 = count，且不出现其他代号）」，不满足就把差异作为报错让 agent 修一轮；前端 `sanitizeRoomItems` 再校验一次，不满足的候选丢弃。

**统一家具选择器 `components/FurniturePicker.tsx`**（基于已有 `components/ui/command.tsx`（cmdk）+ `Popover`）：

- 搜索框（按名称 / 分类 / 类型匹配，复用 `filterFurnitureLibrary` 的匹配语义并扩展到 `category`/`type`）、按分类分组、每项显示缩略符号（`FurnitureShape` 或 `imageUrl`）+ 名称 + 尺寸；内置、项目、账号家具带来源角标。
- 两种模式：`mode="single"`（选中即关闭，回传一项）与 `mode="add"`（选中即追加一项并关闭，已选过的仍可再选）。
- **两处共用**：① 房间 AI 布局的「指定家具」（`mode="add"`）；② 新建家具弹窗 `CustomFurnitureDialog.tsx` 里现在的「参考类型」下拉（第 120 行的 `Select`，选项来自 `furnitureTypes`，约 45 项且不可搜索）替换为 `FurniturePicker mode="single"`，保留顶部「自动匹配 · xxx」项。参考类型的数据源是「类型」而不是具体家具，因此选择器接受通用的 `items: PickerItem[]`（`{ id, label, category?, hint?, visual? }`），由调用方各自映射。

## 一、可用模型（AI All）

只用**同一协议** `openai_chat_completions` 的模型，让 agent 保持单一代码路径（Gemini / Anthropic 系协议不同，暂不纳入可选档）：

| UI 档位 | 显示名 | 模型 id | 为什么 |
| --- | --- | --- | --- |
| 自动（默认） | DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | 成本低、推理强、1M 上下文，结构化输出稳 |
| 快速 | Qwen 3.7 Plus | `alibaba/qwen-3.7-plus` | 低延迟、多模态（能读参考图） |
| 更强 | GLM 5.2 | `z-ai/glm-5.2` | 1M 上下文，复杂户型/多约束更稳 |
| 带图时自动切换 | Kimi K2.5 | `moonshotai/kimi-k2.5` | 原生多模态；选了不带视觉的档位又传了图时，忽略图片并在结果里提示 |

- UI 只展示「自动 / 快速 / 更强」，**不暴露模型 id**；映射写在后端函数顶部一个 `MODEL_TIERS` 常量，便于更换。
- 「数量」= 并行发 N 次请求（1–4），每次 `temperature` 与措辞略不同以获得不同方案；逐个清洗，全部非法才报错。

## 二、数据库

沿用现有命名与写法（`interior_*`、`owner_id uuid not null default auth.uid()`、建表同一条 migration 开 RLS + 仅本人可访问、后端用 admin client 写入）。新增 migration `supabase/migrations/migration_<ts>`：

```
interior_ai_agents                       -- agent 配置（不写 UI，改配置不重新部署）
  id            uuid pk
  owner_id      uuid null              -- null = 全局默认行；非 null = 该账号覆盖
  kind          text 'plan'|'room'
  name          text
  instructions  text                   -- 任务说明 / 风格偏好 / 额外约束（DSL 契约仍在代码里）
  model         text                   -- 空表示用档位默认
  temperature   numeric 0–1
  repair_rounds int 0–3 default 1
  enabled       bool default true
  created_at / updated_at
  unique (owner_id, kind)

interior_ai_generations                  -- 一次生成（= 一次「数量 N」的批量）
  id           uuid pk
  owner_id     uuid not null default auth.uid()
  kind         text 'plan'|'room'
  project_id   uuid null               -- 房间布局时指向 interior_design_projects
  room_id      text null
  prompt       text  check 1–2000
  images       jsonb default '[]'      -- 参考图公开 URL 数组，≤4
  model        text                    -- 实际使用的模型 id
  model_tier   text 'auto'|'fast'|'quality'
  status       text 'succeeded'|'failed'
  error        text
  created_at
  index (owner_id, created_at desc)

interior_ai_candidates                   -- 每个候选方案
  id            uuid pk
  generation_id uuid not null references interior_ai_generations(id) on delete cascade
  owner_id      uuid not null default auth.uid()
  idx           int                     -- 候选序号 0..N-1
  payload       jsonb not null          -- PlanSpec 或 FurnitureSpec[]，≤120KB
  summary       text                    -- 一句话方案说明（生成列表里显示）
  applied_at    timestamptz null        -- 被「应用」时写入
  created_at
  unique (generation_id, idx)
```

RLS：两张表都 `enable row level security`，`FOR SELECT` / `FOR UPDATE`（只写 `applied_at`）限 `auth.uid() = owner_id`；`interior_ai_agents` 额外允许 owner 行 upsert。插入由后端函数用 admin client 完成（失败的行也记 `status='failed'` + `error`，便于排查）。

参考图：走现有资源上传通道拿到公开 URL，只把 URL 存在 `images` 里；不新增存储桶。

## 三、Agent（后端有界修复循环）

新增 `supabase/functions/interior-ai-design/index.ts`，`mode` = `plan | room`：

```
请求 → 鉴权(401) → 入参守卫 → 读 agent 配置(owner 覆盖 → 全局默认)
     → 组装 messages（硬契约 + agent.instructions + 目录 + few-shot + 本轮需求）
     → 循环 round = 0 .. repair_rounds：
          调 POST {API_BASE}/code/api/v1/ai/chat/completions  (stream:false)
          提取 JSON（去 ``` 围栏，取首个 { 到最后一个 }）
          结构校验：字段/枚举/数值范围/引用完整性（开口必须落在已声明墙上、家具 type+name 必须在目录里）
          通过 → 跳出
          不通过 → 把「校验报错原文 + 上一次输出」作为 user 消息追加，再问一轮
     → 仍不通过：记 failed + 返回可读错误
     → 成功：写 generations + candidates，返回候选列表
```

- 头部：`Authorization: Bearer ${Deno.env.get('AI_API_TOKEN_eba6e37b0b3d')}`、`X-Enter-Project-ID: eba6e37b0b3d4d608b63a3efedec61a3`、透传 `X-Session-ID`。
- 有参考图时该条 user 消息用 `content: [{type:'text',text}, ...images.map(url=>({type:'image_url',image_url:{url}}))]`；模型不支持视觉则丢弃图片并在结果里带 `note`。
- 非 2xx：读 `{"error":{"message"}}` 回传 `{ success:false, message }`（402/403 原样透出）。
- 后端只做**结构级**校验；几何级修复（坐标夹取、区间/重叠、去重命名）在前端 `sanitize.ts`。

「生成 → 校验 → 修复」是本功能的成败点：第一反应是改提示词与 few-shot，而不是加更多兜底分支。

## 四、前端

新增 `src/features/interior/ai/`：`types.ts`（契约）、`catalog.ts`（`aiCatalog(design, accountFurniture)` 合并 `library` + `design.customCatalog` + 账号家具并按 `type:name` 去重；`resolveCatalogItem`）、`roomContext.ts`（`roomContextOf(design, room)`：开口归属边 = 取开口所在墙中点，落在房间 bbox 外扩 200mm 内且距某边 300mm 内即归到该边并换算 `along`；`roomKindOf(name)` 由房名推断）、`sanitize.ts`（**重点测试**：坐标取整 10mm 并夹到轮廓内；内墙命名空间化 `w-<key>`、房间 id 命名空间化 `r-<id>` —— `validateDesign` 的 id 集合跨墙/房间/家具/开口共用，撞 id 会导致方案加载失败；丢弃长度 <600mm 的内墙、面积 <2m² 或缺点的房间；开口宽度夹到 700–1800 且必须在所属墙内、同墙不重叠；`mat` 非法回退 `wood`；家具只保留目录里能解析的条目、尺寸夹到 200–4000、总数 ≤60/每区 ≤25；房间或内墙全非法时抛错）、`apply.ts`（**重点测试**：`applyPlanToDesign` 只覆盖墙/开口/房间/家具，保留 `width/depth/thickness/height/structureUnlocked/costSettings/custom*`；`applyRoomFurniture(design, roomId, items, resolve, {replace})` 用 `bbox(room.rings[0])` 作 zone 调 `placeFurniture`，`replace` 时先删房间内现有家具（`inRoom`），把不在 `library` 里的目录项登记进 `design.customCatalog`（照 `Workbench.add`）；**不做 `pushOut` 二次修正**，否则贴墙家具会被推开）、`client.ts`（两个薄封装 + `FunctionsHttpError → context.json().message` 的统一错误提取）、`preview.ts`（由 `FurnitureSpec[]` / `PlanSpec` 生成预览用 `Design`）。

改 `data/floorplanBuilder.ts`：`placeFurniture(zone, resolve?)` / `buildPlan(spec, resolve?)` 加可选素材解析器（默认仍查 `library`）。
改 `data/templates.ts`：`AI_TEMPLATE_ID = 'ai'`、`isAiTemplate()`；`createProject(template, name, size?, design?)` 支持传入现成 `Design`。
改 `model/templateState.ts`：`isPruneDesign` 对 AI 户型直接返回 false（没有可重建的初始模板）。
改 `components/Workbench.tsx`：向 `SelectionEditor` 传 `aiEnabled`（`p.loggedIn`）；画布顶部标签对 AI 户型显示「AI 生成户型」；`resetDesign` 对 AI 户型走 DXF 那条提示。
改 `components/ProjectManager.tsx`：`createProject(input.template, input.name, input.size, input.design)`。
改 `src/index.css`：AI 对话框/候选网格样式只用语义 token，明暗都可读。
**需要登录**（与现有 AI 生图一致），未登录不显示这两个入口。

### UI 图纸（ASCII）

**入口一：选中房间 → 工具条「AI 布局」**（工具条位置即你截图里 `主卧 · 材质 · 本间 ¥4,092 · ⚙ · ✕` 那一行，在「材质」后面插入一项）

```
  ┌──────────────────────────────────────────────────────────────┐
  │ ⠿  主卧   ▣ 材质 ▾   ✦ AI 布局   $ 本间 ¥4,092 ▾   ⚙     ✕  │
  └──────────────────────────────────────────────────────────────┘
                    │ 点击
                    ▼
  ┌─ AI 布局 · 主卧 ─────────────────────────────────────────────┐
  │ ┌──────────────────────────────────────────────────────────┐ │
  │ │ [🖼 参考图.png ✕] [🖼 02.jpg ✕]             由 AI 提供    │ │
  │ │                                                          │ │
  │ │  描述这个房间要怎么布置…                                 │ │
  │ │                                                          │ │
  │ └──────────────────────────────────────────────────────────┘ │
  │  3.44 × 3.54 m · 12.18 m²   [卧室·双人床][紧凑][加书桌][原木] │
  │ ──────────────────────────────────────────────────────────── │
  │  [ ＋ ]                      模型 自动 ▾   数量 2 ▾    ( ↑ ) │
  │  ○ 保留现有家具（2 件）                                       │
  └──────────────────────────────────────────────────────────────┘
```

生成中（同一弹窗原地替换输入区）：

```
  ┌─ AI 布局 · 主卧 ─────────────────────────────────────────────┐
  │  正在生成 3 个方案…                                          │
  │  ┌────────┐ ┌────────┐ ┌────────┐                            │
  │  │ ░░░░░░ │ │ ░░░░░░ │ │ ░░░░░░ │   ← 骨架屏                  │
  │  └────────┘ └────────┘ └────────┘                            │
  └──────────────────────────────────────────────────────────────┘
```

产物态（输入框替换为产物展示，可返回；选中一个后「应用」）：

```
  ┌─ AI 布局 · 主卧 ───────────────────────────────────  [← 返回] ┐
  │  已生成 3 个方案（家具均来自素材库）                          │
  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                │
  │  │ ▭▭▭▭ 床   │ │ ▭▭▭▭ 床   │ │ ▭▭▭▭ 床   │  ← PlanThumbnail│
  │  │ ▭ 柜  ▭ 桌 │ │ ▭ 柜       │ │ ▭ 桌  ▭ 柜 │    真实几何预览 │
  │  │   ▭▭       │ │   ▭ 桌     │ │            │                │
  │  └────────────┘ └────────────┘ └────────────┘                │
  │   双人床+衣柜    双人床+书桌    紧凑布局                      │
  │   ✓ 已选                                                      │
  │ ──────────────────────────────────────────────────────────── │
  │                                              [取消]  [应用 →] │
  └──────────────────────────────────────────────────────────────┘
```

**入口二：新建项目 → 「AI 创建」**

```
  ┌─ 新建项目 ───────────────────────────────────────────────────┐
  │  项目名称  [                    ]                             │
  │  户型模板  [ AI 创建 ▾ ]   （空白户型 / 内置模板 / AI 创建）  │
  │ ┌─ 表单 ─────────────────┐ ┌─ 预览 ───────────────────────┐  │
  │ │ 长 / m   [  9.00 ] 必填 │ │ ┌────────┐ ┌────────┐        │  │
  │ │ 宽 / m   [ 10.00 ] 必填 │ │ │ ▢▢▢▢▢▢ │ │ ▢▢▢▢▢▢ │        │  │
  │ │ 需求描述 必填           │ │ │ ▢ ▢ ▢  │ │ ▢▢  ▢▢ │        │  │
  │ │ [三室两厅两卫，主卧朝南]│ │ └────────┘ └────────┘        │  │
  │ │ [，开放式厨房，原木风 ] │ │  三室两厅 · 90 m²            │  │
  │ │ 参考图片（可选）        │ │  ✓ 已选                      │  │
  │ │ [＋] [🖼 参考.png ✕]    │ │ ┌────────┐  ← WallLayoutPreview│
  │ │ 模型 自动 ▾  数量 2 ▾   │ │ │ ░░░░░░ │    生成中           │  │
  │ │ [ ✦ AI 生成户型 ]       │ │ └────────┘                    │  │
  │ └─────────────────────────┘ └──────────────────────────────┘  │
  │                        [取消]   [重新生成]   [确认保存 →]     │
  └──────────────────────────────────────────────────────────────┘
```

**候选 = 可落地的结构化方案，不是位图**：位图无法「应用」（放不出家具、算不出价）。每个候选是模型返回的一份 `FurnitureSpec[]` / `PlanSpec`，前端用现有 `<PlanThumbnail>`（房间候选）与 `<WallLayoutPreview>`（整户候选）渲染成真实几何预览 —— 预览与落地结果 100% 一致，且「多张候选 → 选一张 → 应用」是真实闭环。

## 五、数据契约

```ts
// 目录条目：代号只在本次请求内有效；映射表留在前端
type AiCatalogEntry = { code: string; name: string; category: string; type: string; w: number; d: number };
type AiModelTier = 'auto' | 'fast' | 'quality';
type AiRoomContext = {
  roomId: string; name: string; mat: string; area: number;
  zone: [number, number, number, number];   // 房间净空矩形（绝对 mm）= 摆放分区
  w: number; d: number;
  doors:   { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  windows: { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  existing: { code: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
};
// plan: { width, depth, description, images?, catalog, modelTier, projectId? }
//       → { success, generationId, candidates: { id, index, plan: PlanSpec, summary }[] }
// room: { room: AiRoomContext, roomKind, description, images?, catalog, keepExisting,
//         required: { code: string; count: number }[], onlyRequired: boolean,
//         modelTier, projectId? }
//       → { success, generationId, candidates: { id, index, items: PlacedSpec[], note }[] }
//       PlacedSpec = { code, back:'up'|'down'|'left'|'right', along?, gap?, w?, d? }
```

提示词要讲清 DSL 约定（沿用 `floorplanBuilder.ts` 注释）：单位 mm、原点在室内净轮廓左上角、x 向右 y 向下（下方为南）；**不要输出外墙**（渲染器按长宽自动生成），只输出内墙 `{key,dir,at,from,to}`；房间用 `box:[x1,y1,x2,y2]`（L 形用 `poly`）且互不重叠、铺满平面；开口用 `{wall,kind,at,width,into?}`，`wall` 引用内墙 `key` 或 `top/right/bottom/left`；**家具一律用目录代号** `{zone, items:[{code,back,along,gap}]}`，禁止使用目录以外的代号。附一段真实 few-shot（从 `templatePresets.ts` 两房参数化结果精简，家具改写成代号形式）+ JSON-only 要求。

## 六、风险与边界

- 模型输出不稳定 → agent 修复循环 + `sanitize.ts` 全量修复 + `buildPlan()` 兜底，失败只提示重试，绝不写入半成品方案。
- id 命名空间化必须在 `sanitize.ts` 完成并有测试（墙/房间/家具/开口共用一套 id 命名空间）。
- AI 户型没有初始模板，「重置方案」不可用（与 CAD 导入户型一致）。
- agent 配置这一轮**只建表 + 种子全局默认行**，不做管理界面；提示词调整走改数据或改代码常量。
- 生成历史表这一轮只写入，不做历史浏览 UI（为后续留口子）。

## 关键文件

- 新增：`supabase/migrations/migration_<ts>`、`supabase/functions/interior-ai-design/index.ts`、`src/features/interior/ai/{types,catalog,roomContext,sanitize,apply,client,preview}.ts`、`src/features/interior/components/{AiRoomDialog,AiGenerateDialog,aiComposer}.tsx`
- 修改：`src/features/interior/data/floorplanBuilder.ts`、`data/templates.ts`、`model/templateState.ts`、`components/{SelectionEditor,NewProjectDialog,ProjectManager,Workbench}.tsx`、`src/index.css`
- 复用：`buildStructure` / `buildPlan` / `placeFurniture`、`library` / `materials`（`data/catalog.ts`）、`bbox` / `inRoom`（`model/geometry.ts`）、`PlanThumbnail`、`WallLayoutPreview`、`useAsyncAction`、`notify`、`validateDesign`

## Verification

- 自动：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm run build`。
- 手动（需登录 + 已部署 migration 与 `interior-ai-design`）：
  1. 选中房间 → 工具条「AI 布局」→ 描述「双人床靠上墙，需要衣柜和书桌」→ 数量 3 → 出现 3 张候选平面图 → 「返回」回输入态且描述保留 → 选一张「应用」→ 家具贴墙落地、报价能算出价格、Ctrl+Z 一次全部撤销；`interior_ai_candidates` 里该行 `applied_at` 被写入。
  2. 新建项目 → 「AI 创建」→ 长宽非法时按钮禁用 → 9 × 10 m + 「三室两厅两卫，主卧朝南，开放式厨房，原木风」→ 生成 → 多张候选（含内墙/门窗）→ 选一张确认保存 → 编辑器里外墙严格 9 × 10、2D/3D 正常、房间面积合理。
  3. 参考图：两处 `＋` 都能选图并出现 chip、可删；带图时 `images` 落在 generations 行里且不报错。
  4. 负向：未登录看不到「AI 布局」；描述为空时发送/生成按钮禁用；模拟 AI 返回非法 JSON → agent 自动修复一轮，仍失败则提示重试且方案不变，generations 行 `status='failed'`。
- 响应式：AI 对话框在 390px 与 1280px 宽度下均可用（`website_screenshot` 两个预设核对）。

## Implementation checklist

- [ ] migration：建 `interior_ai_agents` / `interior_ai_generations` / `interior_ai_candidates`，同一条 migration 开 RLS + owner 策略，并种子 `kind='plan'` 与 `kind='room'` 两条全局默认 agent 行。
- [ ] `data/floorplanBuilder.ts`：`placeFurniture(zone, resolve?)` / `buildPlan(spec, resolve?)` 支持外部素材解析器，默认仍查 `library`。
- [ ] `data/templates.ts`：`AI_TEMPLATE_ID` / `isAiTemplate`，`createProject` 支持传入现成 `Design`。
- [ ] `model/templateState.ts`：AI 户型不做 pristine 判定。
- [ ] `ai/types.ts` + `ai/catalog.ts`：契约类型、目录合并与解析。
- [ ] `ai/roomContext.ts`：`roomContextOf`（门窗归属边与 along 换算）与 `roomKindOf`。
- [ ] `ai/sanitize.ts`：`sanitizePlanSpec` / `sanitizeRoomItems`（id 命名空间化、坐标夹取、开口与家具过滤、全非法时抛错）。
- [ ] `ai/apply.ts`：`applyPlanToDesign`、`applyRoomFurniture`（replace/keep + 自定义目录登记）、`applied_at` 回写。
- [ ] `ai/preview.ts`：候选 → 预览用 `Design`。
- [ ] `ai/client.ts`：两个薄封装、`modelTier` 传参、统一错误提取。
- [ ] `supabase/functions/interior-ai-design/index.ts`：鉴权、入参守卫、读 agent 配置、修复循环、模型档位与视觉模型切换、结构校验、写 generations + candidates、错误封装。
- [ ] `components/aiComposer.tsx`：图片 chip + `＋` 上传（≤4）+ 快捷标签 + 模型/数量下拉 + 发送，两处入口共用。
- [ ] `components/AiRoomDialog.tsx`：输入态 → 生成中 → 候选网格（`PlanThumbnail`）→ 返回/应用；含「保留现有家具」开关。
- [ ] `components/SelectionEditor.tsx`：房间工具项新增「AI 布局」并接线（`aiEnabled` 控制可见）。
- [ ] `components/AiGenerateDialog.tsx` + `NewProjectDialog.tsx`：AI 创建模式（必填长宽 + 描述 + 图片 + 模型/数量）→ 多候选择一 → `NewProjectInput.design`。
- [ ] `components/ProjectManager.tsx`：`createProject(..., input.design)`。
- [ ] `components/Workbench.tsx`：传 `aiEnabled`；AI 户型标签与重置提示。
- [ ] `src/index.css`：AI 对话框与候选网格样式使用语义 token，明暗对比度正常。
- [ ] 测试：`ai/sanitize.test.ts`、`ai/apply.test.ts`、`ai/roomContext.test.ts`、`components/aiRoomDialog.test.tsx`、`components/aiGenerateDialog.test.tsx`（mock `ai/client`），更新 `NewProjectDialog.test.tsx`。

## Verification checklist

- [ ] `pnpm test` 全绿，覆盖：合法 `FurnitureSpec[]` 落地并替换/保留房间内原家具；合法 `PlanSpec` 落地；内墙/房间 id 与墙 id 冲突时被命名空间化；开口越界/重叠被丢弃；家具引用未知 `type` 被过滤；带参考图不改变「家具必须来自目录」的约束。
- [ ] `sanitizePlanSpec` 对「房间全非法」「内墙全非法」、`sanitizeRoomItems` 对「无可解析条目」都抛错而非返回空方案。
- [ ] `pnpm lint`、`pnpm exec tsc --noEmit` 无错误；`pnpm run build` 成功。
- [ ] `validateDesign` 对 AI 落地后的方案（新建 AI 户型、房间 AI 布置两条路径）都通过，刷新后方案可正常加载。
- [ ] migration 应用后，三张新表 RLS 已开启，且非本人账号读不到他人的 generations / candidates 行。
- [ ] `aiRoomDialog.test.tsx`：mock 3 个候选 → 出现 3 个预览 → 「返回」保留描述 → 选第 2 个「应用」后 `change` 只调用一次且落地第 2 个；失败时显示错误且不改动方案。
- [ ] `aiGenerateDialog.test.tsx`：描述为空时生成按钮禁用；mock 成功出现 N 张 `WallLayoutPreview` 且 `onSubmit` 带 `design`；失败显示 `role="alert"` 且不提交。
- [ ] 负向：未登录选中房间无「AI 布局」；AI 创建模式下长宽非法时按钮禁用。
- [ ] 手动跑通四种场景（房间 AI 布局含返回/应用、AI 创建含多选、参考图 chip、错误边界与撤销）。
