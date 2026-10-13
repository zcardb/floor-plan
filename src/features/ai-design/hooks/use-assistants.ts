import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/notify";
import { readAll } from "@/lib/paging";
import { backend } from "@/lib/backend";
import { assistantPage, createAssistant, type Assistant, type AssistantInput } from "../api/assistants";

/**
 * AI 输入框的引擎选择器用：一次读完我的全部小助手（选择器不分页），并能就地新建。
 * enabled 为 false 时不请求（如不需要选模型的入口）；没登录时为空列表。
 * 管理页的小助手列表走统一分页，见 AssistantManager。
 */
export function useAssistants(enabled = true) {
  const [items, setItems] = useState<Assistant[]>([]), [loading, setLoading] = useState(enabled), [error, setError] = useState("");
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const supabase = await backend();
      const { data: { session } } = await supabase.auth.getSession();
      const next = session ? await readAll(assistantPage) : [];
      if (run === epoch.current) setItems(next);
    } catch (cause) {
      if (run === epoch.current) setError(errorMessage(cause, "小助手读取失败，请重试"));
    } finally {
      if (run === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [load, enabled]);
  const create = useCallback(async (input: AssistantInput) => {
    const created = await createAssistant(input);
    setItems((all) => [created, ...all]);
    return created;
  }, []);
  return { items, loading, error, create };
}
