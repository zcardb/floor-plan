import { FunctionsHttpError } from "@supabase/supabase-js";
import type { AiCatalogEntry, AiPlanExample, AiPlanSnapshot, AiRequiredItem, AiRoomContext, AiRoomExample } from "./types";
import { backend } from "../cloud/backend";

export const AI_FUNCTION = "interior-ai-design";
export const AI_COUNT_OPTIONS = [1, 2, 3, 4] as const;
export const AI_IMAGE_LIMIT = 4;
/** 附件总数（图片 + 素材）。 */
export const AI_ATTACHMENT_LIMIT = 6;
export const AI_REFERENCE_BUCKET = "images";

export interface AiCandidatePayload<T> {
  candidateId: string;
  index: number;
  summary: string;
  result: T;
  /** 方案能落地但有需要微调的地方（尺寸或间距），数量由后端给出。 */
  warnings?: number;
}

export interface AiRequestResult<T> {
  success: boolean;
  message?: string;
  model?: string;
  candidate?: AiCandidatePayload<T>;
}

export interface AiRequestBase {
  generationId: string;
  index: number;
  /** 0–1，用来在同一批里拿到不同的方案。 */
  description: string;
  images: string[];
  /** 非图片素材，后端交给模型自行判断如何使用。 */
  files?: { url: string; name: string; ext: string }[];
  catalog: AiCatalogEntry[];
  projectId?: string;
  /** 直接选择的模型，或自己的小助手（二选一，见 models.ts engineFields）。 */
  model?: string;
  assistantId?: string;
}

export interface AiRoomRequest extends AiRequestBase {
  room: AiRoomContext;
  plan: AiPlanSnapshot;
  /** 房间里已有的家具（名称 + 尺寸），让方案接着现状调整。 */
  existing: { name: string; w: number; d: number }[];
  required: AiRequiredItem[];
  /** 同类模板房间的标准答案，帮模型学会坐标与摆法。 */
  examples?: AiRoomExample[];
}

/** 整户户型：长宽、几室几厅几卫都写在 description 里，尺寸由模型决定。 */
export interface AiPlanRequest extends AiRequestBase {
  /** 算法模板序列化出的整户标准答案。 */
  examples?: AiPlanExample[];
}

/** 只把中文说明展示给用户；英文原文（网络错误、上游报错）换成可操作的提示。 */
export const friendlyError = (message: string | undefined, fallback = "生成失败，请重试") =>
  message && /[\u4e00-\u9fa5]/.test(message) ? message : /fetch|network|Failed to send/i.test(message ?? "") ? "网络连接异常，请检查网络后重试" : fallback;

async function invoke<T>(body: object): Promise<AiRequestResult<T>> {
  const supabase = await backend();
  const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body });
  if (error instanceof FunctionsHttpError) {
    const value = await error.context.json().catch(() => ({}));
    throw new Error(friendlyError(value.message || value.error?.message || error.message));
  }
  if (error) throw new Error(friendlyError(error.message));
  const result = data as AiRequestResult<T>;
  if (!result || result.success !== true || !result.candidate) throw new Error(friendlyError(result?.message));
  return result;
}

/** 房间布局：一次请求出一个候选；数量 N 由前端并行发起，先完成的先展示。 */
export const generateRoomCandidate = (request: AiRoomRequest) =>
  invoke<{ items: { code: string; back: string; along?: number; gap?: number }[] }>({ mode: "room", ...request });

/** 整户户型：一次请求出一个候选（内墙 + 门窗 + 家具）。 */
export const generatePlanCandidate = (request: AiPlanRequest) => invoke<unknown>({ mode: "plan", ...request });

/** 记录候选被应用（生成历史留档，失败不阻塞编辑）。 */
export async function markCandidateApplied(candidateId: string): Promise<void> {
  if (!candidateId) return;
  const supabase = await backend();
  await supabase.from("interior_ai_candidates").update({ applied_at: new Date().toISOString() }).eq("id", candidateId);
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_MAX = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
/** 非图片素材的存储桶：原文件直传，不限类型，单个 ≤ 50 MB。 */
export const AI_MATERIAL_BUCKET = "ai-materials";
export const MATERIAL_MAX = 50 * 1024 * 1024;

/** 参考图：校验类型与大小后直传 Enter Cloud Storage，返回公开地址。 */
export async function uploadReferenceImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("只支持 JPG / PNG / WebP / GIF 图片");
  if (file.size > IMAGE_MAX) throw new Error("图片不能超过 10 MB");
  const path = `ai-all/${crypto.randomUUID()}.${EXT[file.type]}`;
  const supabase = await backend();
  const { error } = await supabase.storage.from(AI_REFERENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(AI_REFERENCE_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("参考图上传失败，请重试");
  return data.publicUrl;
}

/** 家装素材（图纸、素材包、3D 模型等）：原文件直传，不在前端解析，交给 AI 自行判断。 */
export async function uploadReferenceMaterial(file: File, ext: string): Promise<string> {
  if (file.size > MATERIAL_MAX) throw new Error("素材不能超过 50 MB");
  const path = `ai-all/${crypto.randomUUID()}.${ext}`;
  const supabase = await backend();
  const { error } = await supabase.storage.from(AI_MATERIAL_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(AI_MATERIAL_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("素材上传失败，请重试");
  return data.publicUrl;
}
