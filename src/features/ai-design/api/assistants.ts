import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageRequest, PageResult } from "@/lib/paging";
import { backend } from "@/lib/backend";
import { readPage } from "@/lib/backend";

export interface Assistant {
  id: string;
  name: string;
  avatar: string;
  model: string;
  prompt: string;
  updatedAt: string;
}

export type AssistantInput = Pick<Assistant, "name" | "avatar" | "model" | "prompt">;

export const ASSISTANT_LIMITS = { name: 30, prompt: 8000 } as const;

const TABLE = "interior_ai_assistants";
const COLUMNS = "id,name,avatar,model,prompt,updated_at";
type Row = { id: string; name: string; avatar: string; model: string; prompt: string; updated_at: string };
const fromRow = (r: Row): Assistant => ({ id: r.id, name: r.name, avatar: r.avatar, model: r.model, prompt: r.prompt, updatedAt: r.updated_at });
/** 生成的类型尚未包含此表时也能编译：按无类型客户端访问这一张表。 */
const table = async () => ((await backend()) as unknown as SupabaseClient).from(TABLE);
const toRow = (input: AssistantInput) => ({ name: input.name.trim(), avatar: input.avatar, model: input.model, prompt: input.prompt });

/** 我的小助手的一页（新建的在前），列表接口 interior_assistant_page；仅本人可读（RLS 按 owner_id 限定）。 */
export async function assistantPage(request: PageRequest): Promise<PageResult<Assistant>> {
  const page = await readPage<Row>("interior_assistant_page", {}, request);
  return { ...page, list: page.list.map(fromRow) };
}

export async function createAssistant(input: AssistantInput): Promise<Assistant> {
  const { data, error } = await (await table()).insert(toRow(input)).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function updateAssistant(id: string, input: AssistantInput): Promise<Assistant> {
  const { data, error } = await (await table()).update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function removeAssistant(id: string): Promise<void> {
  const { error } = await (await table()).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
