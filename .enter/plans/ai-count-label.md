# AI 输入框：数量下拉文案 + 模型列表只留可读图

## Context

两处 AI 入口（「AI 创建户型」弹窗、房间 AI 弹窗）共用 `AiComposer`，它下方有两个选择器：模型/小助手、数量。

1. 数量下拉现在显示「2 个方案」，展开后是「1 个方案 / 2 个方案 / 3 个方案 / 4 个方案」，同一词组重复四遍，且与「查看上一次的 2 个方案」这类结果文案混在一起 —— 改成「数量」语义：触发器「数量 2」，下拉项只显示 `1 / 2 / 3 / 4`。
2. 模型列表里有三个不读图的模型（DeepSeek V4 Flash / V4 Pro、GLM 5.2），选中后带图生成会弹「不读取参考图」提示，属于用户可避免的坑 —— 只保留可读图模型，不读图的从前端定义与后端白名单里彻底移除；默认模型改为其中速度最快的 GPT 6 Luna（原默认正是不读图的 DeepSeek V4 Flash）。

不改：生成流程、`AI_COUNT_OPTIONS`、`useAiBatch` / `useRoomAi`、`AiResults` 的「N 个方案」结果文案、数据库结构。

## 改动点

### 1. 数量下拉文案 — `src/features/interior/components/AiComposer.tsx`

第 122–126 行：

```tsx
<DropdownMenuTrigger asChild>
  <button type="button" className="ai-composer-count" aria-label={`数量，当前 ${value.count}`}>{`数量 ${value.count}`}<ChevronDown size={12} /></button>
</DropdownMenuTrigger>
<DropdownMenuContent align="end" className="ai-count-menu">
  <DropdownMenuRadioGroup value={String(value.count)} onValueChange={(next) => onCount(Number(next))}>
    {AI_COUNT_OPTIONS.map((n) => <DropdownMenuRadioItem key={n} value={String(n)} aria-label={`数量 ${n}`}>{n}</DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>
</DropdownMenuContent>
```

要点：文案用模板字符串一次性渲染（避免 SSR 相邻文本节点插入 `<!-- -->`，断言更稳）；`aria-label` 保留完整语义，读屏念「数量 1」；RadioGroup 的 value / onValueChange 不动。

### 2. 模型列表只留可读图 — `src/features/interior/ai/models.ts`

- 删除 `deepseek/deepseek-v4-flash`、`deepseek/deepseek-v4-pro`、`z-ai/glm-5.2` 三条。
- `DEFAULT_AI_MODEL` 由 `"deepseek/deepseek-v4-flash"` 改为 `"openai/gpt-6-luna"`（`DEFAULT_AI_ENGINE` 随之指向它）。
- `AiModel` 去掉恒为 `true` 的 `vision` 字段，并同步去掉两处 `hint: m.vision ? "可读图" : undefined`（列表里已全是可读图模型，行行标「可读图」是噪音）：
  - `src/features/interior/components/AiEnginePicker.tsx` 第 25–31 行
  - `src/features/interior/components/AssistantDialog.tsx` 第 20–26 行
- 两个选择器的条目都由 `AI_MODELS` 生成，删条目即自动生效（`engineItems` 与 `MODEL_ITEMS` 无需改结构）。
- `modelOf` / `modelName` 保持现状：旧小助手仍存着已删除的模型 id，列表里会显示「未知模型」，编辑保存后写回新的默认模型。

### 3. `AiComposer.tsx` 去掉已不可达的「不读取参考图」提示

第 53–54、135 行：`vision` 字段移除后，`model` 变量与 `blind` 判断只剩这条提示在用，一并删除（连同 `modelOf` 的 import），移除第 135 行的 `ai-composer-notice` 段落。

理由：不读图的模型已不可选；旧小助手在后端满足 `MODELS[model]` 回落逻辑（`supabase/functions/interior-ai-design/index.ts` 第 494 行 `?? DEFAULT_MODEL`），实际会用默认的可读图模型，所以「不读图」的提示不再成立。若不希望扩到这一步，可只删模型定义、保留该提示（不影响其他改动）。

### 4. 后端白名单同步 — `supabase/functions/interior-ai-design/index.ts`

- 第 11、12、15 行删除三个 `vision: false` 的模型条目。
- 第 18 行 `DEFAULT_MODEL` 改为 `'openai/gpt-6-luna'`。
- `MODELS` 的 `vision` 字段与第 183–184 行的 `imagesOf` 逻辑保留（结构不变，现在恒为带图；`'chat'` 协议仍被 Kimi K3 / Qwen 3.8 Max / MiniMax M3 使用）。
- 第 72 行的 `!MODELS[b.model]` 校验不动：旧的模型 id 会返回「不支持的模型」而不再被静默接受。

### 5. 样式 — `src/index.css`

- 第 4014 行 `.ai-count-menu { min-width: 120px; ... }` → `min-width: 96px`：下拉项只剩单个数字后菜单仍保持左对齐选中圆点（`pl-8`）即可，不必留 120px。
- `.ai-composer-count` 药丸样式同时被 `AiEnginePicker` 复用，不改。

### 6. 测试 — `src/features/interior/components/aiComponents.test.tsx`

- 第 113 行 `expect(html).toContain("2 个方案")` → `expect(html).toContain("数量 2")`，并新增 `expect(html).not.toContain("个方案")`。
- 第 114 行 `expect(html).toContain("DeepSeek V4 Flash")` → `expect(html).toContain("GPT 6 Luna")`。
- 第 104 行用例标题里的「模型默认 DeepSeek V4 Flash」改为「模型默认 GPT 6 Luna」。
- 其余测试文件不涉及模型清单（已确认 `ai.test.ts`、`managementUi.test.tsx`、`toolbarMenus.test.tsx` 均无模型断言）。

## Implementation checklist

- [x] `AiComposer.tsx` 触发器可见文案为「数量 {count}」（模板字符串单节点），`aria-label` 为「数量，当前 {count}」
- [x] `AiComposer.tsx` 下拉项渲染 `{n}` 且 `aria-label={`数量 ${n}`}`，界面不再出现「个方案」
- [x] `AiComposer.tsx` 删除 `model` / `blind` 变量、`modelOf` import 与第 135 行 `ai-composer-notice` 段落
- [x] `models.ts` 删除三个不读图模型，`DEFAULT_AI_MODEL = "openai/gpt-6-luna"`，`AiModel` 不再有 `vision` 字段
- [x] `AiEnginePicker.tsx` 与 `AssistantDialog.tsx` 的 `hint: m.vision ? "可读图" : undefined` 已删除
- [x] `supabase/functions/interior-ai-design/index.ts` 白名单删除同样三条，`DEFAULT_MODEL = 'openai/gpt-6-luna'`
- [x] `index.css` 中 `.ai-count-menu` 的 `min-width` 为 96px
- [x] `aiComponents.test.tsx` 断言更新为「数量 2」「不包含『个方案』」「GPT 6 Luna」

## Verification checklist

- [x] `pnpm test src/features/interior/components/aiComponents.test.tsx src/features/interior/ai/ai.test.ts` 全绿
- [x] `pnpm run build` 通过（含 TypeScript 校验，确认没有残留的 `m.vision` / `modelOf` 引用）
- [x] 手动（默认态）：「AI 创建户型」触发器为「数量 2」与「GPT 6 Luna」；展开数量下拉只有 `1 / 2 / 3 / 4`；选 4 后生成 4 个候选
- [x] 手动（模型列表）：输入框的模型分组与小助手弹窗的模型列表都不再出现 DeepSeek V4 Flash / V4 Pro / GLM 5.2；选中模型后生成正常
- [x] 边界（旧数据）：仍指向已删除模型的小助手在列表里显示「未知模型」，编辑保存后落到 GPT 6 Luna；直接用它生成不报错（后端回落到默认模型），且带参考图时模型确实读图
- [x] 负向：用已删除的模型 id 直接调用后端函数会被 `!MODELS[b.model]` 拒绝，返回「不支持的模型」
- [x] 键盘：数量下拉上下键 + Enter 仍能切换（RadioGroup 行为未变）
