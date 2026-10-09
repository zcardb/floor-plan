/**
 * AI 可选模型（与后端函数 interior-ai-design 的白名单一致）；界面只显示名称。
 * 只放可读图的模型：不读图的模型选中后带参考图也不会被读取，属于用户避不开的坑。
 */
export interface AiModel {
  id: string;
  name: string;
  group: "Claude" | "OpenAI" | "国产";
}

export const AI_MODELS: AiModel[] = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", group: "Claude" },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", group: "Claude" },
  { id: "openai/gpt-6.1-sol", name: "GPT 6.1 Sol", group: "OpenAI" },
  { id: "openai/gpt-6-astra", name: "GPT 6 Astra", group: "OpenAI" },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", group: "OpenAI" },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", group: "国产" },
  { id: "alibaba/qwen-3.8-max", name: "Qwen 3.8 Max Preview", group: "国产" },
  { id: "minimax/minimax-m3", name: "MiniMax M3", group: "国产" },
];

/** 默认模型取可读图模型里最快的：新建即能用图，又不让用户等。 */
export const DEFAULT_AI_MODEL = "openai/gpt-6-luna";

export const modelOf = (id: string | undefined) => AI_MODELS.find((m) => m.id === id);
export const modelName = (id: string | undefined) => modelOf(id)?.name ?? "未知模型";

/** AI 输入框里选中的「引擎」：直接选模型，或选自己的小助手（使用小助手的模型与 Prompt）。 */
export type AiEngine = { kind: "model"; id: string } | { kind: "assistant"; id: string };

export const DEFAULT_AI_ENGINE: AiEngine = { kind: "model", id: DEFAULT_AI_MODEL };

/** 发请求时的字段：二选一。 */
export const engineFields = (engine: AiEngine): { model?: string; assistantId?: string } =>
  engine.kind === "model" ? { model: engine.id } : { assistantId: engine.id };
