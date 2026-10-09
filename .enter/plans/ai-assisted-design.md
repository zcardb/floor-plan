# AI 辅助生成户型 / 布局 / 家具

## Context

目前这个室内设计工具的「生成」全部是**离线确定性**的，没有任何 AI 参与：

| 环节 | 现在的做法 | 代码位置 |
| --- | --- | --- |
| 户型模板 | 4 个内置模板 + 1 个参考户型，用参数化函数拼出来（`apartment()` 按 卧室数/服务区宽/进深 算墙位） | `data/templatePresets.ts`、`data/templates.ts` |
| 空白户型 | 只画一圈外墙 + 一个整块房间，长宽由用户输入 | `data/templates.ts: blankDesign` |
| 布局（内墙/门窗/房间） | 模板里手写墙体数组与开口数组 | `data/floorplanBuilder.ts: buildStructure` |
| 家具 | 每组房间的家具用「靠哪面墙 + 沿墙位置 + 离墙距离」的简写硬编码，再按素材库尺寸解析成坐标 | `data/templateFurniture.ts`、`floorplanBuilder.ts: placeFurniture` |

其中 `PlanSpec`（墙/开口/房间/家具分区）与 `FurnitureSpec`（背靠墙 + 沿墙位置 + 离墙距离）已经是一套**声明式 DSL**，且 `buildPlan()` 会做完整性校验（墙名唯一、开口不越界不重叠、家具素材必须在库内）。这正是最适合让 AI 直接输出的目标格式——AI 只产出 DSL，几何计算、2D/3D 渲染、计价、导出全部复用现有代码。

本次要做三件事：**新建项目按长宽 + 描述生成户型**、**选中房间后按现有家具库布置房间**、**整个项目交给 AI（一键重排 + 对话式修改）**。已确认的约束：

- 家具只能从现有素材库 / 我的家具库中选（保证可计价、可 3D 渲染、可导出）。
- 生成户型时外墙严格等于输入的长 × 宽（矩形），AI 只负责内墙分割、门窗与家具。
- 整体项目 AI 要**同时**提供「一键按描述重排」和「对话面板多轮修改」。

## 架构决策

1. **复用现有 DSL，不新增一套 AI 格式**：`plan` 模式让模型输出 `PlanSpec`，`room` 模式输出 `FurnitureSpec[]`，前端用现有的 `buildPlan()` / `placeFurniture()` 落地。新增的只有「AI 输出 → 清洗校验 → 应用」这一层。
2. **一个后端函数、三种模式**：`interior-ai-design`，`mode` = `plan | room | chat`。三个模式的 CORS、鉴权、模型调用、JSON 提取、错误封装完全共用，避免三份样板代码（与现有 `interior-furniture-image-*` 的鉴权/`success:false` 约定保持一致）。
3. **非流式 JSON 输出**：设计生成要拿到**结构化结果**才能落地，逐字流式对画布没有价值且要处理 SSE + JSON 混流。统一 `stream:false`，一次拿到 `{...}`；前端用 `useAsyncAction` 的 pending 态 + 按钮 loading 表达进度。这样也不需要引入 SSE 依赖。
4. **模型**：`deepseek/deepseek-v4-pro`（协议 `openai_chat_completions`，成本低、推理强、1M 上下文）。模型 id 只写在后端函数顶部一个常量里，便于更换（备选：`z-ai/glm-5.2`、`anthropic/claude-sonnet-5`）。
5. **AI 生成的户型单独打标**：`templateId = 'ai'`（新常量 `AI_TEMPLATE_ID`），沿用现有 `DXF_TEMPLATE_ID` 的先例——没有可重建的初始模板，因此「重置方案」提示用撤销、画布顶部显示「AI 生成户型」。
6. **需要登录**：与现有 AI 生图一致（后端函数校验用户）。未登录时 AI 入口不显示（右侧面板 tab 本来就只在登录后渲染）。
7. **可撤销**：所有 AI 落地都通过一次 `change()`（单条历史），并在底部给「可用撤销恢复」提示。

## 数据契约

```ts
// 目录（喂给模型的可用家具，来自 library + design.customCatalog + 账号家具库）
type AiCatalogEntry = { type: string; name: string; w: number; d: number; category: string };

// 房间上下文（room / chat 模式）
type AiRoomContext = {
  id: string; name: string; mat: string; area: number;
  w: number; d: number;                       // 净空开间/进深 mm
  doors:   { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  windows: { edge: 'up'|'down'|'left'|'right'; at: number; width: number }[];
  existing: { type: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
  zone: [number, number, number, number];     // 房间净空矩形（绝对坐标，mm）
};

// 一次 AI 调用返回的动作（chat 模式可带回，前端统一应用）
type AiAction =
  | { kind: 'plan'; plan: PlanSpec }                                              // 整套重排
  | { kind: 'room_furniture'; roomId: string; items: FurnitureSpec[]; replace: boolean };
```

请求：`{ mode:'plan', width, depth, description, catalog }` → `{ success, plan, summary }`
`{ mode:'room', room: AiRoomContext, roomKind, description, keepExisting, catalog }` → `{ success, items, note }`
`{ mode:'chat', messages, context:{ width, depth, rooms, furnitureCount, catalog } }` → `{ success, reply, action }`

`PlanSpec` 提示词里要讲清约定（沿用 `floorplanBuilder.ts` 注释）：单位 mm、原点在室内净轮廓左上角、x 向右 y 向下（下方为南）；**不要输出外墙**（渲染器按长宽自动生成），只输出内墙 `{key,dir,at,from,to}`；房间用 `box:[x1,y1,x2,y2]`（L 形用 `poly`）且互不重叠、铺满平面；开口用 `{wall,kind,at,width,into?}`，`wall` 引用内墙 `key` 或 `top/right/bottom/left`；家具用 `{zone, items:[{type,name,back,along,gap}]}`，`type`/`name` 必须来自给定目录。提示词里附一段真实的 few-shot 例子（从 `templatePresets.ts` 的两房参数化结果精简而来）+ 一个 JSON-only 的输出要求。

## 后端

新增 `supabase/functions/interior-ai-design/index.ts`：

- CORS + `OPTIONS`，仅 `POST`；用 anon client + 请求头 `Authorization` 取用户，未登录返回 401（照抄 `interior-furniture-image-submit` 的写法）。
- 入参守卫：`mode` 合法；`width/depth` 500–50000；`description` ≤ 300 字；`catalog` ≤ 300 条、字段合法；`chat` 的 `messages` ≤ 30 条、每条 ≤ 4000 字。
- 按 `mode` 组装 system prompt（共用「约定说明 + 目录 + 输出格式」的拼装函数），调用
  `POST https://api.enter.pro/code/api/v1/ai/chat/completions`，头带 `Authorization: Bearer ${Deno.env.get('AI_API_TOKEN_eba6e37b0b3d')}`、`X-Enter-Project-ID: eba6e37b0b3d4d608b63a3efedec61a3`、前端透传的 `X-Session-ID`（对话会话稳定复用），body `{ model: MODEL, messages, stream: false, temperature: 0.4 }`。
- 非 2xx：读 `{"error":{"message"}}` 并回传 `{ success:false, message }`（402/403 等状态码原样透出）。
- 从回复中稳健提取 JSON：去 ``` 围栏、取首个 `{` 到最后一个 `}`、`JSON.parse`；失败回 502「AI 返回内容无法解析，请重试」。
- 只做**形状级**检查后原样返回；深度修复与落地放在前端（可在 vitest 里覆盖）。

## 前端

新增 `src/features/interior/ai/`：

- `types.ts`：上面的契约类型（`PlanSpec`/`FurnitureSpec` 直接 import 复用）。
- `catalog.ts`：`aiCatalog(design, accountFurniture)` 合并 `library` + `design.customCatalog` + 账号家具并按 `type:name` 去重；`resolveCatalogItem(catalog, type, name)` 返回 `LibraryItem | null`。
- `roomContext.ts`：`roomContextOf(design, room)`（导出地/门位置：开口墙中点落在房间 bbox 外扩 200mm 内、距某条边 300mm 内即归到该边并换算 `along`）、`roomKindOf(name)` 房名推断类型（主卧/卧室/儿童房/书房/客厅/餐厅/厨房/卫生间/阳台/玄关，可被 UI 覆盖）。
- `sanitize.ts`（纯函数，重点测试）：
  - `sanitizePlanSpec(raw, {width, depth, catalog})`：坐标取整到 10mm 并夹到轮廓内；内墙命名空间化 `w-<key>`、房间 id 命名空间化 `r-<id>`（**必须**：`validateDesign` 的 id 集合跨墙/房间/家具/开口共用，撞 id 会导致方案加载失败）；丢弃长度 <600mm 的内墙、面积 <2m² 或缺点的房间；开口宽度夹到 700–1800 且必须在所属墙范围内、同墙不重叠，否则丢弃；`mat` 不在 `materials` 里回退 `wood`；家具只保留目录里能找到 `type/name` 的条目、尺寸夹到 200–4000、`zone` 夹到轮廓内、总数 ≤60/每区 ≤25；房间或内墙全部非法时抛「AI 返回的户型无法应用，请重试」。
  - `sanitizeRoomItems(raw, {zone, catalog})`：只保留可解析的 `type/name`、尺寸/离墙距离合理、条数 1–20，坐标为相对 `zone` 的 `along/gap` 语义。
- `apply.ts`（纯函数，重点测试）：
  - `applyPlanToDesign(design, spec, resolve)`：`buildPlan(spec, resolve)` 得到墙/开口/房间/家具，只覆盖这四项，保留 `width/depth/thickness/height/structureUnlocked/costSettings/customCatalog/custom*` 等其余字段；新建项目时以 `blankDesign(size)` 为底并置 `templateId: AI_TEMPLATE_ID`。
  - `applyRoomFurniture(design, roomId, items, resolve, {replace})`：`zone = bbox(room.rings[0])` → `placeFurniture({zone, items}, resolve)`；`replace` 时先删该房间内的现有家具（`inRoom`）；把不在 `library` 里的目录项登记进 `design.customCatalog`（照 `Workbench.add` 的写法），保证报价/导出可用。
  - **不做 `pushOut` 二次修正**：`placeFurniture` 的贴墙语义与内置模板（`templateFurniture.ts`）完全一致，额外推挤会把贴墙家具推开。
- `client.ts`：`requestPlanDesign / requestRoomFurniture / requestChatDesign` 三个薄封装，`supabase.functions.invoke` + 现有 `useFurnitureImage.ts` 里那套错误提取（`FunctionsHttpError` → `context.json().message`），统一抛出可展示的中文错误。

改 `data/floorplanBuilder.ts`：给 `placeFurniture(zone, resolve?)` 与 `buildPlan(spec, resolve?)` 加一个可选的素材解析器（默认仍查 `library`），用于解析账号家具库 / 项目自定义目录里的条目。

改 `data/templates.ts`：`export const AI_TEMPLATE_ID = 'ai'`、`isAiTemplate()`；`createProject(template, name, size?, design?)` 支持传入现成 `Design`（`template === AI_TEMPLATE_ID` 时 state 直接用 `design`，无 `design` 时回退 `blankDesign(size)`，并写入 `templateId: 'ai'`、`structureUnlocked: true`）。

改 `model/templateState.ts`：`isPristineDesign()` 对 `templateId === AI_TEMPLATE_ID` 直接返回 false（AI 户型没有可重建的初始模板，避免误判「已回到初始模版」）。

改 `components/NewProjectDialog.tsx`（+ `NewProjectDialog.test.tsx`）：

- 户型模板下拉新增 `AI 生成户型`（value `ai`）。
- 选中 `ai` 时：长/宽可编辑（与空白户型同一套校验）、新增「需求描述」textarea（必填，≤200 字，placeholder 例如「三室两厅两卫，主卧朝南，开放式厨房，需要独立书房，原木风」）。
- 点「AI 生成户型」→ `useAsyncAction` 调 `requestPlanDesign` → `sanitizePlanSpec` → `applyPlanToDesign(blankDesign(size), …)` → 结果存 `aiDesign` 状态，**复用现有 `<WallLayoutPreview design={…} />`** 在对话框里预览（figcaption 显示 `summary`）；随后按钮变为「重新生成 / 确认保存」。生成失败在 figure 里用 `role="alert"` 显示错误。
- `NewProjectInput` 增加可选 `design?: Design`；`onSubmit` 带上，`ProjectManager.tsx` 改为 `createProject(input.template, input.name, input.size, input.design)`。

改 `components/PropertyPanel.tsx`：房间分区新增一节「<Sparkles/> AI 布置本房间」（`accountFurniture` 作为新 prop 传入，`aiEnabled` 控制可见），点击打开新组件 `AiRoomDialog`。

新增 `components/AiRoomDialog.tsx`：房间名/开间×进深只读展示 + 房间类型 select（默认 `roomKindOf(r.name)`）+ 需求描述 textarea + 「保留现有家具」开关（房间已有家具时才显示）→ 调 `requestRoomFurniture` → `sanitizeRoomItems` → `applyRoomFurniture` → `change()`（单条历史）+ `notify.success('已布置 N 件家具，可用撤销恢复')`。

改 `components/PanelModeTabs.tsx`：模式扩到 `'props' | 'cost' | 'ai'`，加第三个 tab「<Bot/> AI 助手」。

新增 `components/AiChatPanel.tsx`（右侧面板第三模式）：

- 顶部：「AI 设计助手」说明 + 快捷操作「<Wand2/> 按描述重排整个方案」（展开描述输入 → `mode:'plan'`，用当前 `width/depth` → `applyPlanToDesign`）——需要先 `confirm()`（走现有 `useConfirm`）再落地，因为会替换整套方案。
- 对话：消息列表（user/assistant）、pending loading、错误行、`清空对话`（重置消息与 `X-Session-ID`）、输入框 + `Send`。
- 每轮发送时**现算**上下文（`width/depth`、房间列表、家具数、`catalog`）并带上最近若干轮消息。
- 收到 `action` 时：`plan` → 先 confirm 再 `change()`；`room_furniture` → 校验 `roomId` 存在 → `change()`；随后在消息下方显示「已应用：…」徽标与撤销提示。

改 `components/Workbench.tsx`：新增 `panelMode === 'ai'` 分支渲染 `AiChatPanel`（传 `design/change/accountFurniture`）；向 `PropertyPanel` 传 `accountFurniture`；画布顶部标签对 `templateId === AI_TEMPLATE_ID` 显示「AI 生成户型」；`resetDesign` 对 AI 户型走 DXF 那条分支的提示（「AI 生成的户型没有初始模板，请用撤销逐步恢复」）。

改 `src/index.css`：为 AI 助手面板 / AI 对话框补少量类（沿用现有语义色变量与 `panel-*`、`cms-*` 风格，不写死颜色）。

## 风险与边界

- 模型输出不稳定 → 靠 `sanitize.ts` 全量修复 + `buildPlan()` 兜底校验，失败只提示重试，绝不写入半成品方案。
- 提示词与 JSON 输出格式是本功能的核心，失败率高的第一反应是改提示词（few-shot 例子 + 更硬的约束），不是加 fallback 逻辑。
- 房间 id 与墙 id 共用一套命名空间，命名空间化必须在 `sanitize.ts` 里完成并有测试。
- AI 户型没有初始模板，「重置方案」不可用（与 CAD 导入户型一致）。

## 关键文件

- 新增：`supabase/functions/interior-ai-design/index.ts`、`src/features/interior/ai/{types,catalog,roomContext,sanitize,apply,client}.ts`、`src/features/interior/components/{AiRoomDialog,AiChatPanel}.tsx`
- 修改：`src/features/interior/data/floorplanBuilder.ts`、`data/templates.ts`、`model/templateState.ts`、`components/{NewProjectDialog,ProjectManager,PropertyPanel,PanelModeTabs,Workbench}.tsx`、`src/index.css`
- 复用：`buildStructure`/`buildPlan`/`placeFurniture`（`data/floorplanBuilder.ts`）、`library`/`materials`（`data/catalog.ts`）、`bbox`/`inRoom`（`model/geometry.ts`）、`useAsyncAction`（`@/hooks/useAsyncAction`）、`useConfirm`、`notify`、`WallLayoutPreview`、`validateDesign`（`model/validation.ts`）

## Verification

- 自动：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`（vitest 跑 `src/features/interior`）、`pnpm run build`。
- 手动（需登录 + 已部署 `interior-ai-design`）：
  1. 新建项目 → 模板选「AI 生成户型」→ 9 × 10 m + 「三室两厅两卫，主卧朝南，开放式厨房，原木风」→ 生成 → 预览出现墙/房间 → 确认保存 → 进入编辑器：外墙严格 9 × 10、有内墙/门窗/房间/家具、2D 与 3D 都正常、房间列表面积合理。
  2. 选中一个房间 → AI 布置本房间（卧室，描述「双人床靠上墙，需要衣柜和书桌」）→ 家具出现在房间内且贴墙、报价面板能算出这些家具的价格、Ctrl+Z 一次全部撤销。
  3. 右侧「AI 助手」→ 快捷「按描述重排整个方案」→ 确认后整套方案替换、一次撤销可回到原方案。
  4. 对话输入「把客厅的沙发换成转角沙发」「客厅太挤了，重新布置一下」→ 回复同时按要求落地，消息下方显示已应用。
  5. 负向：未登录时不出现任何 AI 入口；描述为空时按钮不可用；长宽超范围时报错不生成；模拟 AI 返回非法 JSON → 提示重试且方案不变。
- 响应式：AI 助手面板与对话框在 390px 与 1280px 宽度下均可用（`website_screenshot` 两个预设核对）。

## Implementation checklist

- [ ] `data/floorplanBuilder.ts`：`placeFurniture(zone, resolve?)` 与 `buildPlan(spec, resolve?)` 支持外部素材解析器，默认仍查 `library`，现有调用与测试不变。
- [ ] `data/templates.ts`：新增 `AI_TEMPLATE_ID` / `isAiTemplate`，`createProject` 支持传入现成 `Design`。
- [ ] `model/templateState.ts`：AI 户型不做 pristine 判定。
- [ ] `ai/types.ts` + `ai/catalog.ts`：契约类型、目录合并与 `resolveCatalogItem`。
- [ ] `ai/roomContext.ts`：`roomContextOf`（含门窗归属边与 along 换算）与 `roomKindOf`。
- [ ] `ai/sanitize.ts`：`sanitizePlanSpec` / `sanitizeRoomItems`，含 id 命名空间化、坐标夹取、开口与家具过滤、非法时抛错。
- [ ] `ai/apply.ts`：`applyPlanToDesign`（只覆盖墙/开口/房间/家具，保留其他字段）与 `applyRoomFurniture`（replace/keep + 自定义目录登记）。
- [ ] `ai/client.ts`：三个薄封装与统一错误提取。
- [ ] `supabase/functions/interior-ai-design/index.ts`：鉴权、入参守卫、三种模式的提示词与模型调用、JSON 提取与错误封装。
- [ ] `NewProjectDialog.tsx`：AI 模板选项、描述输入、生成→预览→确认保存（`NewProjectInput.design`）。
- [ ] `ProjectManager.tsx`：把 `input.design` 传给 `createProject`。
- [ ] `AiRoomDialog.tsx` + `PropertyPanel.tsx`：房间 AI 入口、生成与落地、单条历史。
- [ ] `PanelModeTabs.tsx` + `AiChatPanel.tsx` + `Workbench.tsx`：AI 助手 tab、快捷重排（带确认）、对话应用动作、AI 户型标签与重置提示。
- [ ] `src/index.css`：AI 面板/对话框样式使用语义 token，明暗两种模式对比度正常。
- [ ] 新增测试：`ai/sanitize.test.ts`、`ai/apply.test.ts`、`ai/roomContext.test.ts`、`components/aiDesign.test.tsx`（mock `ai/client`），并更新 `NewProjectDialog.test.tsx`。

## Verification checklist

- [ ] `pnpm test` 全绿，且新增用例覆盖：合法 PlanSpec 落地；内墙/房间 id 与墙 id 冲突时被命名空间化；开口越界/重叠被丢弃；家具引用未知 `type` 被过滤；`replace=false` 保留房间内原家具、`replace=true` 清空后重放。
- [ ] `sanitizePlanSpec` 对「房间全非法」「内墙全非法」抛错而不是返回空方案。
- [ ] `pnpm lint` 与 `pnpm exec tsc --noEmit` 无错误。
- [ ] `pnpm run build` 成功。
- [ ] `validateDesign` 对 AI 落地后的方案（新建项目 + 房间布置 + 整套重排三种路径）都能通过，刷新页面后方案可正常加载。
- [ ] `NewProjectDialog.test.tsx`：选 `ai` 模板时描述为空按钮禁用；mock 生成成功后出现 `WallLayoutPreview` 预览且 `onSubmit` 带上 `design`；mock 失败时显示 `role="alert"` 且不提交。
- [ ] 负向：未登录用户看不到 AI 助手 tab，`PropertyPanel` 不渲染 AI 房间入口。
- [ ] 手动跑通五种场景（新建 AI 户型 / 房间布置 / 一键重排 / 对话修改 / 登录与错误边界）。
