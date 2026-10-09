# AI 创建户型：去掉「高级设计」，尺寸直接写在 Prompt 里

## Context

「AI 创建户型」弹窗现在是「描述 + 参考图」输入框，下面再挂一个默认收起的「高级设计」（长 / 宽 / 卧室 / 厅 / 卫生间）。用户希望直接干掉这块折叠区，让需求描述本身承担长宽与房间数，输入框的 placeholder 负责提示用户写长宽。

已确认：
1. **整条参数链路一起清理**（前端请求字段、`planFields.ts`、后端 `hints`/`width`/`depth` 校验），户型尺寸完全由描述文字决定，由模型在 JSON 顶层输出，前端 `sanitizePlan` 只做范围夹取。
2. **示例文案直接作为默认输入**：弹窗打开时输入框里就带着这段示例需求，用户可以直接改；placeholder 用同一段文案，清空后仍能看到提示。

## 改动

### 1. `src/features/interior/components/AiCreateProjectDialog.tsx`
- 删除 `advanced / width / depth / rooms` 状态，以及 `size / badSize / summary / sizeError / useMemo`、`parseMeterDraft` 与 `planFields` 相关 import，`ChevronDown`、`SlidersHorizontal` 图标 import。
- `PlanRequest` 收敛为 `{ description: string; images: string[] }`；`send()` 不再拼 `hints` / `width` / `depth`，`generatePlanCandidate` 只带 `description / images / catalog / ...engine`；`sanitizePlan(result, { catalog: aiCatalog })`。
- `AiComposer` 不再传 `blocked`（`badSize` 已不存在）。
- 新增文件内常量并作为默认输入：
  ```ts
  /** 默认填入的示例需求：长宽写在描述里由模型读取，用户可直接改。 */
  const DEFAULT_PLAN_PROMPT = "长 12 m × 宽 10 m，三室两厅两卫，主卧朝南带卫生间，开放式厨房，原木风";
  ```
  `composer` 初值改为 `{ description: DEFAULT_PLAN_PROMPT, images: [], count: DEFAULT_AI_COUNT, engine: DEFAULT_AI_ENGINE }`。
- placeholder 用 `描述户型需求，例如：${DEFAULT_PLAN_PROMPT}`（即「描述户型需求，例如：长 12 m × 宽 10 m，三室两厅两卫，主卧朝南带卫生间，开放式厨房，原木风」），默认有文字时不可见，清空后仍给提示。
- 删除整个 `<section className="ai-advanced">`；`echo`（`AiResults` 回显）不再有 `details`，只回显描述与参考图。
- `DialogDescription` 补一句提示尺寸写进描述：`描述需求（长宽、几室几厅几卫都写在描述里），AI 生成带门窗与家具的整套户型；选中一个方案后创建项目。`

### 2. `src/features/interior/components/AiComposer.tsx`
- 删除只在「高级设计」里用过的 `blocked?: string` 属性与文档注释，`reason` 从 `missingAssistant` 起算。

### 3. `src/features/interior/ai/client.ts`
- `AiPlanRequest` 删除 `width` / `depth` / `hints` 字段。

### 4. `src/features/interior/ai/sanitize.ts`
- `sanitizePlan(value, { catalog })`：去掉 `fixedWidth / fixedDepth` 与 `sizeOf` 分支，改为只读模型输出的 `width` / `depth`，`round10(clamp(n, 3000, 40000))`，缺失仍抛 `方案缺少户型尺寸`；注释里的「高级设计没填的长宽」同步改写。

### 5. `src/features/interior/ai/planFields.ts`
- 整体删除（`AI_SIZE_LIMITS` / `AI_ROOM_LIMITS` / `RoomCounts` / `advancedLabel` / `planHints` 已无其他引用）。

### 6. `src/index.css`
- 删除 `/* AI 创建：高级设计（默认收起，选填） */` 起 `.ai-advanced` / `.ai-advanced-toggle` / `.ai-advanced-caret` / `.ai-advanced-body` / `.ai-advanced-row` 共 8 行；`.ai-size-hint`、`.ai-note` 仍被别处使用，保留。

### 7. `supabase/functions/interior-ai-design/index.ts`（需重新部署）
- `Body` 与 `guard` 删除 `width` / `depth` / `hints`（含 `高级设计参数无效` 分支）；`plan` 模式不再做长宽范围校验。
- `sizeLine(b)` 改为固定一句：`室内净尺寸未固定：若用户需求里给出了长宽（如「长 12 m × 宽 10 m」）或面积，请严格按该数值换算成 mm（长 = width，宽 = depth）；否则按房间数量与面积确定合理尺寸，并在 JSON 顶层输出 "width" 与 "depth"（3000–40000 mm，取 100 的整数倍）。`
- `planPrompt` 删除 `b.hints` 那两行；`PLAN_CONTRACT` 坐标约定处补一句「用户需求里写明长宽/面积时按该尺寸设计」。
- `validatePlan`：`W / D` 只取 `v.width` / `v.depth`（`finite(..., 3000, 40000)`），缺失时仍返回 hard 错误 `顶层必须输出 width 与 depth`。

### 8. 测试
- `src/features/interior/components/aiComponents.test.tsx`：删除 `advancedLabel, planHints` import 与「高级设计参数」describe；弹窗用例改为断言 `html` 不含 `高级设计`、textarea 默认内容含 `长 12 m × 宽 10 m`（默认示例即默认输入，所以发送按钮可用，不再断言 disabled）、`2 个方案`、`DeepSeek V4 Flash`。
- `src/features/interior/ai/ai.test.ts`：整户 fixture 的 `plan` 顶层补 `width: 8000, depth: 9000`，相应 `sanitizePlan(plan, { width: 8000, depth: 9000, catalog })` 全部改为 `{ catalog }`；「AI 决定户型尺寸」用例改为「模型给的尺寸被夹进 3000–40000」，并保留缺尺寸报错用例。

## 关键文件
- `src/features/interior/components/AiCreateProjectDialog.tsx`
- `src/features/interior/components/AiComposer.tsx`
- `src/features/interior/ai/{client,sanitize}.ts`
- `supabase/functions/interior-ai-design/index.ts`
- `src/index.css`

## Implementation checklist
- [ ] `AiCreateProjectDialog.tsx` 删除高级设计状态、UI 与 `planFields` / `parseMeterDraft` / 图标 import，文件内不再出现 `ai-advanced`、`hints`、`width`、`depth`
- [ ] `PlanRequest` 只保留 `description` / `images`，`generatePlanCandidate` 与 `sanitizePlan` 调用同步收敛
- [ ] 新增 `DEFAULT_PLAN_PROMPT` 常量并作为 `composer.description` 初值（含长宽、几室几厅几卫、风格），placeholder 用同一段文案，`DialogDescription` 补上「长宽写在描述里」的提示
- [ ] `AiCreateProjectForm` 渲染结果不含 `高级设计` 与 `ai-advanced` 节点
- [ ] `AiComposer` 移除 `blocked` 属性，`AiRoomDialog` 调用处不受影响（本来就没传）
- [ ] `client.ts` 的 `AiPlanRequest` 删除 `width` / `depth` / `hints`
- [ ] `sanitize.ts` 的 `sanitizePlan` 只按模型输出定尺寸，缺尺寸仍抛错
- [ ] `planFields.ts` 删除，仓库内无残留引用
- [ ] `index.css` 删除 `.ai-advanced*` 规则，`.ai-size-hint` / `.ai-note` 保留
- [ ] 后端 `Body` / `guard` / `planPrompt` 去掉 `width` / `depth` / `hints`，`sizeLine` 指向「按描述里的长宽」，`validatePlan` 只认模型输出尺寸
- [ ] 后端函数重新部署成功
- [ ] `aiComponents.test.tsx` 与 `ai.test.ts` 按新行为更新

## Verification checklist
- [ ] `pnpm lint` 与 `pnpm exec tsc --noEmit` 无错误
- [ ] `pnpm test`（vitest，`src/features/interior`）全绿，含更新后的弹窗断言与 `sanitizePlan` 尺寸用例
- [ ] `pnpm run build` 通过
- [ ] 预览里打开「新建项目 → AI 创建」：弹窗只剩项目名称 + 输入框，无「高级设计」折叠区，输入框里已带默认示例文案且可直接编辑、发送按钮可用；清空后 placeholder 显示同一段提示（desktop_1280 与 mobile_390 各看一次）
- [ ] 直接用默认示例发一批方案，生成的户型长宽接近 12 × 10 m（模型输出，允许 100 mm 级偏差）；把描述删成「三室两厅两卫，原木风」（不写长宽）时仍能生成
- [ ] 描述里写超范围尺寸（如「长 100 m」）不会崩：后端校验/前端夹取后仍出方案或给出可读中文错误
