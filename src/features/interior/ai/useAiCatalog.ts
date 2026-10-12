import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryItem } from "../model/types";
import { buildAiCatalog } from "./catalog";
import { backend } from "../cloud/backend";
import { furnitureFromRow } from "./furnitureRow";
import type { AiCatalog } from "./types";

/** 账号家具库会有很多页，AI 目录一次读全（上限 500 件，够用且不至于拖慢请求）。 */
const ACCOUNT_LIMIT = 500;

/**
 * 本次生成可用的家具目录：内置素材库 + 项目目录 + 账号家具库。
 * 每处新增的家具都会自动进入下一次生成 —— 不改提示词、不改后端。
 */
export function useAiCatalog(project: LibraryItem[] | undefined, enabled: boolean) {
  const [account, setAccount] = useState<LibraryItem[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = await backend();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAccount([]); return; }
      const { data, error: readError } = await supabase.from("interior_furniture_catalog")
        .select("*").order("created_at", { ascending: false }).order("catalog_id").limit(ACCOUNT_LIMIT);
      if (readError) throw readError;
      setAccount((data ?? []).map(furnitureFromRow));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "账号家具读取失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);
  const catalog: AiCatalog = useMemo(() => buildAiCatalog({ project, account }), [project, account]);
  const items = useMemo(() => [...catalog.byId.values()], [catalog]);
  return { catalog, items, loading, error, reload };
}
