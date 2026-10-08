import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomWall } from '../model/types';
import { validCustomWall } from '../model/hardMaterials';

/** 墙面 / 屋面 / 吊顶账号库共用同一结构：key + 名称 + 颜色 + 单价，仅本人可读写。 */
const tables = {
  wall: { table: 'interior_wall_catalog', key: 'wall_key', label: '墙面' },
  roof: { table: 'interior_roof_catalog', key: 'roof_key', label: '屋面' },
  ceiling: { table: 'interior_ceiling_catalog', key: 'ceiling_key', label: '吊顶' },
} as const;
type Row = { name: string; color: string; price: number | string | null } & Record<string, unknown>;

export function useColorMaterialCatalog(kind: keyof typeof tables) {
  const { table, key, label } = tables[kind];
  const [items, setItems] = useState<CustomWall[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current; setLoading(true); setError('');
    let data: Row[];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (run !== epoch.current) return;
      if (!session) { setItems([]); setLoading(false); return; }
      const result = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(200);
      if (run !== epoch.current) return;
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      data = (result.data || []) as unknown as Row[];
    } catch (cause) {
      if (run !== epoch.current) return;
      setLoading(false); setError(cause instanceof Error ? cause.message : label + '材料读取失败，请重试');
      return;
    }
    setItems(data.map(r => ({ key: String(r[key]), name: r.name, color: r.color, price: r.price === null ? null : Number(r.price) })).filter(validCustomWall));
  }, [table, key, label]);
  const save = useCallback(async (item: CustomWall) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('请先登录');
    const row = { owner_id: session.user.id, [key]: item.key, name: item.name, color: item.color, price: item.price };
    const { error: writeError } = await supabase.from(table).upsert(row as never, { onConflict: 'owner_id,' + key });
    if (writeError) throw new Error(writeError.message);
  }, [table, key]);
  return { items, loading, error, load, save };
}
