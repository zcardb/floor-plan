import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "../ai/client";

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
type Row = { id: string; name: string; avatar: string; model: string; prompt: string; updated_at: string };
const fromRow = (r: Row): Assistant => ({ id: r.id, name: r.name, avatar: r.avatar, model: r.model, prompt: r.prompt, updatedAt: r.updated_at });
const toRow = (input: AssistantInput) => ({ name: input.name.trim(), avatar: input.avatar, model: input.model, prompt: input.prompt });

/** 我的小助手：仅本人可读写（RLS 按 owner_id 限定），挂载即读取。 */
export function useAssistants() {
  const [items, setItems] = useState<Assistant[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const supabase = await backend();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (run === epoch.current) setItems([]); return; }
      const { data, error: readError } = await supabase.from(TABLE).select("id,name,avatar,model,prompt,updated_at").order("created_at", { ascending: false }).limit(200);
      if (readError) throw readError;
      if (run === epoch.current) setItems((data ?? []).map(fromRow));
    } catch (cause) {
      if (run === epoch.current) setError(cause instanceof Error ? cause.message : "小助手读取失败，请重试");
    } finally {
      if (run === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async (input: AssistantInput) => {
    const supabase = await backend();
    const { data, error: writeError } = await supabase.from(TABLE).insert(toRow(input)).select("id,name,avatar,model,prompt,updated_at").single();
    if (writeError) throw new Error(writeError.message);
    setItems((all) => [fromRow(data), ...all]);
  }, []);
  const update = useCallback(async (id: string, input: AssistantInput) => {
    const supabase = await backend();
    const { data, error: writeError } = await supabase.from(TABLE).update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id).select("id,name,avatar,model,prompt,updated_at").single();
    if (writeError) throw new Error(writeError.message);
    setItems((all) => all.map((a) => (a.id === id ? fromRow(data) : a)));
  }, []);
  const remove = useCallback(async (id: string) => {
    const supabase = await backend();
    const { error: writeError } = await supabase.from(TABLE).delete().eq("id", id);
    if (writeError) throw new Error(writeError.message);
    setItems((all) => all.filter((a) => a.id !== id));
  }, []);
  return { items, loading, error, load, create, update, remove };
}
