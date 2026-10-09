/** AI 可选模型（与后端函数 interior-ai-design 的白名单一致）；界面只显示名称。 */
export interface AiModel {
  id: string;
  name: string;
  group: "Claude" | "OpenAI" | "国产";
  /** 能否读取参考图；不能时后端不传图片。 */
  vision: boolean;
}

export const AI_MODELS: AiModel[] = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", group: "Claude", vision: true },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", group: "Claude", vision: true },
  { id: "openai/gpt-6.1-sol", name: "GPT 6.1 Sol", group: "OpenAI", vision: true },
  { id: "openai/gpt-6-astra", name: "GPT 6 Astra", group: "OpenAI", vision: true },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", group: "OpenAI", vision: true },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", group: "国产", vision: false },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", group: "国产", vision: false },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", group: "国产", vision: true },
  { id: "alibaba/qwen-3.8-max", name: "Qwen 3.8 Max Preview", group: "国产", vision: true },
  { id: "z-ai/glm-5.2", name: "GLM 5.2", group: "国产", vision: false },
  { id: "minimax/minimax-m3", name: "MiniMax M3", group: "国产", vision: true },
];

export const DEFAULT_AI_MODEL = "deepseek/deepseek-v4-flash";

export const modelOf = (id: string | undefined) => AI_MODELS.find((m) => m.id === id);
export const modelName = (id: string | undefined) => modelOf(id)?.name ?? "未知模型";

/** AI 输入框里选中的「引擎」：直接选模型，或选自己的小助手（使用小助手的模型与 Prompt）。 */
export type AiEngine = { kind: "model"; id: string } | { kind: "assistant"; id: string };

export const DEFAULT_AI_ENGINE: AiEngine = { kind: "model", id: DEFAULT_AI_MODEL };

/** 发请求时的字段：二选一。 */
export const engineFields = (engine: AiEngine): { model?: string; assistantId?: string } =>
  engine.kind === "model" ? { model: engine.id } : { assistantId: engine.id };
