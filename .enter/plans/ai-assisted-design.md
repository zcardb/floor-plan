# AI 辅助生成户型 / 布局 / 家具（弱入口版）

## Context

目前这个室内设计工具的「生成」全部是**离线确定性**的，没有任何 AI 参与：

| 环节 | 现在的做法 | 代码位置 |
| --- | --- | --- |
| 户型模板 | 4 个内置模板 + 1 个参考户型，用参数化函数拼出来（`apartment()` 按 卧室数/服务区宽/进深 算墙位） | `data/templatePresets.ts`、`data/templates.ts` |
| 空白户型 | 只画一圈外墙 + 一个整块房间，长宽由用户输入 | `data/templates.ts: blankDesign` |
| 布局（内墙/门窗/房间） | 模板里手写墙体数组与开口数组 | `data/floorplanBuilder.ts: buildStructure` |
| 家具 | 每组房间的家具用「靠哪面墙 + 沿墙位置 + 离墙距离」的简写硬编码，再按素材库尺寸解析成坐标 | `data/templateFurniture.ts`、`floorplanBuilder.ts: placeFurniture` |

其中 `PlanSpec`（墙/开口/房间/家具分区）与 `FurnitureSpec`（背靠墙 + 沿墙位置 + 离墙距离）已经是一套**声明式 DSL**，且 `buildPlan()` 会做完整性校验（墙名唯一、开口不越界不重叠、家具素材必须在库内）。这正是最适合让 AI 直接输出的目标格式：AI 只产出 DSL，几何计算、2D/3D 渲染、计价、导出全部复用现有代码。

本次按「**弱化 AI 入口**」的思路做两件事，都在现有 UI 里自然长出，不新增面板 / tab / 常驻入口：

1. **选中房间 → visual editor 工具条上的「AI 布局」**：点击弹出输入框（描述 + 可选参考图 + 模型 + 数量），生成完成后输入框原地换成候选方案展示，可「返回」重新输入，选中一个后 `应用` 生效。
2. **新建项目 → 新增「AI 创建」选项**：必填长宽 + 描述（可选媒体），弹窗内 loading 生成整户户型 + 门窗预览，一次可出多张，选中一张确认后进入项目详情。

已确认的约束：家具只能从现有素材库 / 我的家具库中选（保证可计价、可 3D 渲染、可导出）；生成户型时外墙严格等于输入的长 × 宽（矩形），AI 只负责内墙分割、门窗与家具。

## 关键设计决策

1. **候选 = 可落地的结构化方案，不是图片**。文生图只能产出位图，位图无法 `应用`（放不出家具、算不出价）。因此每个候选 = 模型返回的一份 `FurnitureSpec[]`（房间）/ `PlanSpec`（整户），前端**用现有 `<PlanThumbnail>` 渲染成平面预览图**（房间底色 + 家具 + 墙体断门留窗，与方案卡片/模板预览同一套渲染）。这样「多张候选 → 选一张 → 应用」是一条真实闭环，且预览与落地结果 100% 一致。
2. **复用现有 DSL，不新增 AI 格式**：`plan` 模式让模型输出 `PlanSpec`，`room` 模式输出 `FurnitureSpec[]`，前端用现有的 `buildPlan()` / `placeFurniture()` 落地。新增的只有「AI 输出 → 清洗校验 → 应用」这一层。
3. **一个后端函数、两种模式**：`interior-ai-design`，`mode` = `plan | room`。两种模式的 CORS、鉴权、模型调用、JSON 提取、错误封装完全共用（沿用现有 `interior-furniture-image-*` 的鉴权与 `{success:false,message}` 约定）。
4. **非流式 JSON 输出**：要拿到结构化结果才能落地，逐个 token 流式对画布没有价值。统一 `stream:false`；进度用按钮 loading / 对话框骨架表达，不需要 SSE 依赖。
5. **「数量」= 并行发 N 次请求**（1–4），每次 `temperature` 与措辞略有差异以获得不同方案；Promise.all 后逐个清洗，丢弃非法候选（全部非法才报错）。
6. **「模型」下拉 = 从可用模型里选档位**（自动 / 快速 / 更强），映射到具体的服务端模型 id；id 只写在后端函数顶部常量里，便于更换。默认 `deepseek/deepseek-v4-pro`（协议 `openai_chat_completions`，成本低、推理强）。
7. **参考图只作为风格/需求输入，不落库**：图片上传后拿公开 URL 带给模型（视觉理解）。需要图片上传能力，走现有的资源上传通道。
8. **AI 生成的户型单独打标**：`templateId = 'ai'`（新常量 `AI_TEMPLATE_ID`），沿用 `DXF_TEMPLATE_ID` 的先例——没有可重建的初始模板，「重置方案」提示改用撤销。
9. **需要登录**：与现有 AI 生图一致（后端校验用户）。未登录时不显示这两个入口。

## 数据契约

```ts
// 目录（喂给模型的可用家具，来自 library + design.customCatalog + 账号家具库）
type AiCatalogEntry = { type: string; name: string; w: number; d: number; category: string };

// 房间上下文
type AiRoomContext = {
  roomId: string; name: string; mat: string; area: number;
  zone: [number, number, number, number];       // 房间净空矩形（绝对坐标 mm）——即摆放分区
  w: number; d: number;                          // 开间 / 进深
  doors:   { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  windows: { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  existing: { type: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
};

// 参考图（可选，仅作输入）
type AiReferenceImage = { url: string };   // 公开 https 图片地址

// 模型档位（UI 显示用）
type AiModelTier = 'auto' | 'fast' | 'quality';
```

请求 / 响应：

- `{ mode:'plan', width, depth, description, images?, catalog, modelTier }` → `{ success, plan: PlanSpec, summary }`
- `{ mode:'room', room: AiRoomContext, roomKind, description, images?, keepExisting, catalog, modelTier }` → `{ success, items: FurnitureSpec[], note }`

`PlanSpec` 提示词里要讲清约定（沿用 `floorplanBuilder.ts` 注释）：单位 mm、原点在室内净轮廓左上角、x 向右 y 向下（下方为南）；**不要输出外墙**（渲染器按长宽自动生成），只输出内墙 `{key,dir,at,from,to}`；房间用 `box:[x1,y1,x2,y2]`（L 形用 `poly`）且互不重叠、铺满平面；开口用 `{wall,kind,at,width,into?}`，`wall` 引用内墙 `key` 或 `top/right/bottom/left`；家具用 `{zone, items:[{type,name,back,along,gap}]}`。提示词附一段真实的 few-shot 例子（从 `templatePresets.ts` 的两房参数化结果精简而来）+ 一个 JSON-only 的输出要求。

## 后端

新增 `supabase/functions/interior-ai-design/index.ts`：

- CORS + `OPTIONS`，仅 `POST`；anon client + 请求头 `Authorization` 取用户，未登录 401（照抄 `interior-furniture-image-submit`）。
- 入参守卫：`mode` 合法；`width/depth` 500–50000；`description` ≤ 300 字；`catalog` ≤ 300 条且字段合法；`images` ≤ 4 条且必须是 `https://` 地址。
- 按 `mode` + `modelTier` 组装 system prompt（共用「约定说明 + 目录 + 输出格式 + few-shot」的拼装函数），调用
  `POST https://api.enter.pro/code/api/v1/ai/chat/completions`，头带 `Authorization: Bearer ${Deno.env.get('AI_API_TOKEN_eba6e37b0b3d')}`、`X-Enter-Project-ID: eba6e37b0b3d4d608b63a3efedec61a3`、透传的 `X-Session-ID`，body `{ model, messages, stream:false, temperature }`；有参考图时把该条 user message 的 `content` 换成 `[{type:'text',text}, ...images.map(url=>({type:'image_url',image_url:{url}}))]` 的数组形式。
- 非 2xx：读 `{"error":{"message"}}` 并回传 `{ success:false, message }`（402/403 等状态码原样透出）。
- 从回复稳健提取 JSON：去 ``` 围栏、取首个 `{` 到最后一个 `}`、`JSON.parse`；失败回 502「AI 返回内容无法解析，请重试」。
- 只做**形状级**检查后原样返回；深度修复与落地放前端（可在 vitest 里覆盖）。

## 前端

新增 `src/features/interior/ai/`：

- `types.ts`：上面的契约类型（`PlanSpec`/`FurnitureSpec` 直接 import 复用）。
- `catalog.ts`：`aiCatalog(design, accountFurniture)` 合并 `library` + `design.customCatalog` + 账号家具并按 `type:name` 去重；`resolveCatalogItem(catalog, type, name)` 返回 `LibraryItem | null`。
- `roomContext.ts`：`roomContextOf(design, room)` —— 开口归属边：取开口所在墙中点，落在房间 bbox 外扩 200mm 内、且距某条边 300mm 内即归到该边并换算 `along`；`roomKindOf(name)` 由房名推断类型（主卧/卧室/儿童房/书房/客厅/餐厅/厨房/卫生间/阳台/玄关，UI 可覆盖）。
- `sanitize.ts`（纯函数，重点测试）：
  - `sanitizePlanSpec(raw, {width, depth, catalog})`：坐标取整到 10mm 并夹到轮廓内；内墙命名空间化 `w-<key>`、房间 id 命名空间化 `r-<id>`（**必须**：`validateDesign` 的 id 集合跨墙/房间/家具/开口共用，撞 id 会导致方案加载失败）；丢弃长度 <600mm 的内墙、面积 <2m² 或缺点的房间；开口宽度夹到 700–1800、必须在所属墙范围内且同墙不重叠，否则丢弃；`mat` 不在 `materials` 里回退 `wood`；家具只保留目录里能找到 `type/name` 的条目、尺寸夹到 200–4000、`zone` 夹到轮廓内、总数 ≤60/每区 ≤25；房间或内墙全部非法时抛「AI 返回的户型无法应用，请重试」。
  - `sanitizeRoomItems(raw, {zone, catalog})`：只保留可解析的 `type/name`、离墙距离与尺寸合理、条数 1–20，抛出「AI 没有给出可用的家具方案，请重试」。
- `apply.ts`（纯函数，重点测试）：
  - `applyPlanToDesign(design, spec, resolve)`：`buildPlan(spec, resolve)` 得到墙/开口/房间/家具，只覆盖这四项，保留 `width/depth/thickness/height/structureUnlocked/costSettings/customCatalog/custom*` 等其余字段；新建项目时以 `blankDesign(size)` 为底并置 `templateId: AI_TEMPLATE_ID`。
  - `applyRoomFurniture(design, roomId, items, resolve, {replace})`：`zone = bbox(room.rings[0])` → `placeFurniture({zone, items}, resolve)`；`replace` 时先删房间内的现有家具（`inRoom`）；把不在 `library` 里的目录项登记进 `design.customCatalog`（照 `Workbench.add` 的写法），保证报价/导出可用。
  - **不做 `pushOut` 二次修正**：`placeFurniture` 的贴墙语义与内置模板（`templateFurniture.ts`）完全一致，额外推挤会把贴墙家具推开。
- `client.ts`：`requestPlanDesign / requestRoomFurniture` 两个薄封装，`supabase.functions.invoke` + `useFurnitureImage.ts` 里那套错误提取（`FunctionsHttpError` → `context.json().message`），统一抛可展示的中文错误。
- `preview.ts`：由 `FurnitureSpec[]` / `PlanSpec` 构建「预览用 `ThumbnailDesign`」——房间候选复用的是**当前方案 + 该房间内家具被替换**的 `Design`，直接喂现有 `<PlanThumbnail>`，无需新渲染代码。

改 `data/floorplanBuilder.ts`：给 `placeFurniture(zone, resolve?)` 与 `buildPlan(spec, resolve?)` 加一个可选素材解析器（默认仍查 `library`），用于解析账号家具库 / 项目自定义目录里的条目。

改 `data/templates.ts`：`export const AI_TEMPLATE_ID = 'ai'`、`isAiTemplate()`；`createProject(template, name, size?, design?)` 支持传入现成 `Design`（`template === AI_TEMPLATE_ID` 时直接用 `design`，无 `design` 时回退 `blankDesign(size)`，并写入 `templateId: 'ai'`、`structureUnlocked: true`）。

改 `model/templateState.ts`：`isPristineDesign()` 对 `templateId === AI_TEMPLATE_ID` 直接返回 false（AI 户型没有可重建的初始模板）。

### 入口一：选中房间 → 工具条「AI 布局」

改 `components/SelectionEditor.tsx`：`{r && …}` 那一段（现为「材质」popover，第 307–332 行）后面插入一个与它同级的按钮工具项 —— `<Sparkles size={15}/> AI 布局`，`aria-label="AI 布局本房间"`，点击打开 `AiRoomDialog`（`open` 状态与现有 `open` 字符串状态同位管理，新增 `'ai'` 值）。仅 `props.aiEnabled`（已登录）时渲染。

新增 `components/AiRoomDialog.tsx`（一个对话框内两种视图，对应参考图的输入态 → 产物态）：

- **输入态**（按参考图的信息层级）：
  - 顶部一行：参考图 chip 列表（已选图片的缩略图 + 名称 + `X` 删除；无图则不显示）+ 右侧「由 AI 提供」小标。
  - 中间：`textarea`「描述这个房间要怎么布置…」。
  - 下面：房间快捷标签按钮（按 `roomKindOf(r.name)` 给 3–4 个，如「卧室 · 双人床」「小户型紧凑」「加书桌」「原木风」，点击追加到描述）+ 只读显示开间×进深与面积。
  - 底部一行：左 `+`（`隐藏的 <input type="file" accept="image/*" multiple>`，选图后上传拿公开 URL，最多 4 张）；右「模型」下拉（自动 / 快速 / 更强，即 `modelTier`）与「数量」下拉（1–4）；最右圆形发送按钮（描述为空时禁用）。
- **生成中**：输入区替换为骨架 + 进度文案（N 个候选逐个出现）。
- **产物态**：候选网格，每个候选 = `<PlanThumbnail design={candidateDesign} />` + 一句 `note`；点击选中（视觉高亮 + 选中标记），底部「返回」（回到输入态，保留已输入的描述 / 图片 / 参数）与「应用」（把选中候选落地、关闭对话框、`notify.success('已布置 N 件家具，可用撤销恢复')`）。
- 顶部「保留现有家具」开关：房间已有家具时才显示；开=只新增，关=替换房间内现有家具。
- 失败：候选区显示错误与「重试」，描述保留。

### 入口二：新建项目 → 「AI 创建」

改 `components/NewProjectDialog.tsx`（+ `NewProjectDialog.test.tsx`）：户型模板下拉新增 `AI 创建`（value `ai`）。选中时右侧表单切换为 AI 模式：

- 「长 / m」「宽 / m」**必填**（沿用现有 `BLANK_SIZE_LIMITS` 校验，错误文案沿用 `RANGE_HINT`）。
- 「需求描述」textarea（必填，≤200 字，placeholder 例如「三室两厅两卫，主卧朝南，开放式厨房，需要独立书房，原木风」）。
- 「参考图片（可选）」：同一个 `+` 上传器（最多 4 张）。
- 「模型」与「数量」（1–4，默认 2）。
- 底部按钮「AI 生成户型」→ `useAsyncAction` 调 `requestPlanDesign`（并行 N 次）→ `sanitizePlanSpec` → `applyPlanToDesign(blankDesign(size), …)` → 得到 N 份候选 `Design`。
- **生成中**：预览区（现有 `figure.new-project-preview` 的位置）显示骨架 + 进度，一次可出现多张。
- **产物态**：候选网格，每张用现有 `<WallLayoutPreview design={candidate} size={size} />` 渲染（整户含内墙/门窗，长宽标注沿用现有实现）+ 面积/`summary` 文案；点选一张 → 底部按钮变为「重新生成 / 确认保存」，点击确认走现有 `onSubmit`，`NewProjectInput` 带上 `design`，`ProjectManager.tsx` 改为 `createProject(input.template, input.name, input.size, input.design)` 并进入项目详情。
- 生成失败：预览区 `role="alert"` 显示错误，输入内容保留，可重试。

改 `components/Workbench.tsx`：向 `SelectionEditor` 传 `aiEnabled`（`p.loggedIn`）；画布顶部标签对 `templateId === AI_TEMPLATE_ID` 显示「AI 生成户型」；`resetDesign` 对 AI 户型走 DXF 那条分支的提示（「AI 生成的户型没有初始模板，请用撤销逐步恢复」）。

改 `src/index.css`：为 AI 对话框的输入态 / 候选网格补样式，沿用现有语义色变量与 `visual-editor-popover`、`cms-*`、`plan-thumbnail` 的风格，不写死颜色，明暗两种模式都可读。

## 风险与边界

- 模型输出不稳定 → 靠 `sanitize.ts` 全量修复 + `buildPlan()` 兜底校验，失败只提示重试，绝不写入半成品方案。
- 提示词与 JSON 输出格式是本功能的核心，失败率高的第一反应是改提示词（few-shot 例子 + 更硬的约束），不是加 fallback 逻辑。
- 房间 id 与墙 id 共用一套命名空间，命名空间化必须在 `sanitize.ts` 里完成并有测试。
- AI 户型没有初始模板，「重置方案」不可用（与 CAD 导入户型一致）。
- 参考图依赖图片上传能力；若上传通道不可用，图片入口需隐藏，描述输入不受影响。

## 关键文件

- 新增：`supabase/functions/interior-ai-design/index.ts`、`src/features/interior/ai/{types,catalog,roomContext,sanitize,apply,client,preview}.ts`、`src/features/interior/components/{AiRoomDialog,AiGenerateDialog,aiComposer}.tsx`（`aiComposer` 放输入态里可复用的 `+ 上传 / 模型 / 数量 / 发送` 那一行与图片 chip）
- 修改：`src/features/interior/data/floorplanBuilder.ts`、`data/templates.ts`、`model/templateState.ts`、`components/{SelectionEditor,NewProjectDialog,ProjectManager,Workbench}.tsx`、`src/index.css`
- 复用：`buildStructure`/`buildPlan`/`placeFurniture`（`data/floorplanBuilder.ts`）、`library`/`materials`（`data/catalog.ts`）、`bbox`/`inRoom`（`model/geometry.ts`）、`PlanThumbnail`（`components/PlanThumbnail.tsx`）、`WallLayoutPreview`、`useAsyncAction`、`notify`、`validateDesign`（`model/validation.ts`）
- 本次不做：常驻 AI 面板 / 对话式整户修改（入口保持弱化，后续如需再单独加）。

## Verification

- 自动：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`（vitest 跑 `src/features/interior`）、`pnpm run build`。
- 手动（需登录 + 已部署 `interior-ai-design`）：
  1. 选中一个房间 → 工具条出现「AI 布局」→ 描述「双人床靠上墙，需要衣柜和书桌」→ 数量选 3 → 出现 3 张候选平面图 → 「返回」能回到输入态且描述还在 → 选一张「应用」→ 房间内出现家具且贴墙、报价面板能算出这些家具的价格、Ctrl+Z 一次全部撤销。
  2. 新建项目 → 模板选「AI 创建」→ 长宽留空时按钮不可用 → 填 9 × 10 m + 「三室两厅两卫，主卧朝南，开放式厨房，原木风」→ 生成 → 预览出现多张候选（含内墙与门窗）→ 选一张确认保存 → 进入编辑器：外墙严格 9 × 10、2D 与 3D 正常、房间列表面积合理。
  3. 参考图：两处 `+` 都能选图并出现缩略图 chip、可删除；带图生成不报错（图片只作参考，不影响家具是否来自素材库）。
  4. 负向：未登录时不出现「AI 布局」入口；描述为空时发送/生成按钮禁用；长宽超范围报错不生成；模拟 AI 返回非法 JSON → 提示重试且方案不变。
- 响应式：AI 对话框在 390px 与 1280px 宽度下均可用（`website_screenshot` 两个预设核对）。

## Implementation checklist

- [ ] `data/floorplanBuilder.ts`：`placeFurniture(zone, resolve?)` 与 `buildPlan(spec, resolve?)` 支持外部素材解析器，默认仍查 `library`，现有调用与测试不变。
- [ ] `data/templates.ts`：新增 `AI_TEMPLATE_ID` / `isAiTemplate`，`createProject` 支持传入现成 `Design`。
- [ ] `model/templateState.ts`：AI 户型不做 pristine 判定。
- [ ] `ai/types.ts` + `ai/catalog.ts`：契约类型、目录合并与 `resolveCatalogItem`。
- [ ] `ai/roomContext.ts`：`roomContextOf`（含门窗归属边与 along 换算）与 `roomKindOf`。
- [ ] `ai/sanitize.ts`：`sanitizePlanSpec` / `sanitizeRoomItems`，含 id 命名空间化、坐标夹取、开口与家具过滤、非法时抛错。
- [ ] `ai/apply.ts`：`applyPlanToDesign`（只覆盖墙/开口/房间/家具，保留其他字段）与 `applyRoomFurniture`（replace/keep + 自定义目录登记）。
- [ ] `ai/preview.ts`：由候选 `FurnitureSpec[]` / `PlanSpec` 生成预览用 `Design`，供 `PlanThumbnail` / `WallLayoutPreview` 使用。
- [ ] `ai/client.ts`：两个薄封装与统一错误提取（含 `modelTier` → 服务端模型的映射传参）。
- [ ] `supabase/functions/interior-ai-design/index.ts`：鉴权、入参守卫、两种模式的提示词与模型调用、参考图的消息组装、JSON 提取与错误封装。
- [ ] `components/aiComposer.tsx`：图片 chip + `+` 上传（最多 4 张）+ 快捷标签 + 模型 / 数量下拉 + 发送按钮，两处入口共用。
- [ ] `components/AiRoomDialog.tsx`：输入态 → 生成中 → 候选网格（`PlanThumbnail`）→ 返回 / 应用；含「保留现有家具」开关。
- [ ] `components/SelectionEditor.tsx`：房间工具项新增「AI 布局」按钮并接线（`aiEnabled` 控制可见）。
- [ ] `components/AiGenerateDialog.tsx` + `NewProjectDialog.tsx`：AI 创建模式（必填长宽 + 描述 + 图片 + 模型/数量）→ 多候选择一 → 确认保存（`NewProjectInput.design`）。
- [ ] `components/ProjectManager.tsx`：把 `input.design` 传给 `createProject`。
- [ ] `components/Workbench.tsx`：传 `aiEnabled`；AI 户型标签与重置提示。
- [ ] `src/index.css`：AI 对话框与候选网格样式使用语义 token，明暗两种模式对比度正常。
- [ ] 新增测试：`ai/sanitize.test.ts`、`ai/apply.test.ts`、`ai/roomContext.test.ts`、`components/aiRoomDialog.test.tsx`、`components/aiGenerateDialog.test.tsx`（均 mock `ai/client`），并更新 `NewProjectDialog.test.tsx`。

## Verification checklist

- [ ] `pnpm test` 全绿，且新增用例覆盖：合法 `FurnitureSpec[]` 落地并替换/保留房间内原家具；合法 `PlanSpec` 落地；内墙/房间 id 与墙 id 冲突时被命名空间化；开口越界/重叠被丢弃；家具引用未知 `type` 被过滤；参考图存在时不改变「家具只能来自目录」的约束。
- [ ] `sanitizePlanSpec` 对「房间全非法」「内墙全非法」、`sanitizeRoomItems` 对「无可解析条目」都抛错而不是返回空方案。
- [ ] `pnpm lint` 与 `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm run build` 成功。
- [ ] `validateDesign` 对 AI 落地后的方案（新建 AI 户型、房间 AI 布置两条路径）都能通过，刷新页面后方案可正常加载。
- [ ] `aiRoomDialog.test.tsx`：mock 生成 3 个候选 → 出现 3 个预览 → 「返回」回到输入态且描述保留 → 选第 2 个「应用」后 `change` 只被调用一次、落地的是第 2 个；mock 失败时显示错误且不改动方案。
- [ ] `aiGenerateDialog.test.tsx`：描述为空时生成按钮禁用；mock 成功出现 N 张 `WallLayoutPreview` 且「确认保存」的 `onSubmit` 带上 `design`；mock 失败显示 `role="alert"` 且不提交。
- [ ] 负向：未登录用户选中房间看不到「AI 布局」；AI 创建模式下长宽非法时按钮禁用。
- [ ] 手动跑通四种场景（房间 AI 布局含返回/应用、AI 创建含多选、参考图 chip、错误边界与撤销）。
