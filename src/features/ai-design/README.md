# ai-design · AI 设计

## 职责

AI 辅助设计：按房间生成布局（`AiRoomDialog`）、AI 对话侧栏（`AiChatPanel`）、AI 新建项目（`AiCreateProjectDialog`）、家具图片的生成与调整（`FurnitureAiDialog`、`useFurnitureImage`）、小助手（常用设计偏好 Prompt）管理页；以及生成用的家具目录、上下文、范例户型、结果落库校正。

## 公开入口

- Hook：`useRoomAi`（类型 `AiEntryTone`）、`useAiCatalog`、`useFurnitureImage`
- lazy 组件：`AiRoomDialog`、`AiChatPanel`、`AiCreateProjectDialog`、`FurnitureAiDialog`（类型 `FurnitureAiResult`）、`AssistantManager`

## 目录

`api/`（`ai-client.ts` 调用 Edge Function `interior-ai-design`、`assistants.ts` 小助手读写与分页）、`hooks/`、`components/`、`model/`（目录、上下文、范例、模型白名单 `models.ts`、结果校正 `apply.ts`）、`types.ts`。

## 规则

- `model/models.ts` 的模型白名单与 Edge Function `interior-ai-design` 保持一致（`interior-furniture-model` 目前没有前端调用方）；布局规则与 `lib/floor-plan/layout-rules.ts` 同一套定义。
- 所有 AI 界面都按需加载，不进首屏包。
- 小助手列表遵守统一分页（`interior_assistant_page`）。
