import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomWall } from '../model/types';
import { validCustomWall } from '../model/hardMaterials';

/** 账号墙面库：与账号地面库同构，仅本人可读写。 */
export function useWallCatalog() {
  const [items, setItems] = useState<CustomWall[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current; setLoading(true); setError('');
    let data;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (run !== epoch.current) return;
      if (!session) { setItems([]); setLoading(false); return; }
      const result = await supabase.from('interior_wall_catalog').select('*').order('created_at', { ascending: false }).limit(200);
      if (run !== epoch.current) return;
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      data = result.data;
    } catch (cause) {
      if (run !== epoch.current) return;
      setLoading(false); setError(cause instanceof Error ? cause.message : '墙面材料读取失败，请重试');
      return;
    }
    setItems((data || []).map(r => ({ key: r.wall_key, name: r.name, color: r.color, price: r.price === null ? null : Number(r.price) })).filter(validCustomWall));
  }, []);
  const save = useCallback(async (wall: CustomWall) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('请先登录');
    const { error: writeError } = await supabase.from('interior_wall_catalog').upsert({
      owner_id: session.user.id, wall_key: wall.key, name: wall.name, color: wall.color, price: wall.price,
    }, { onConflict: 'owner_id,wall_key' });
    if (writeError) throw new Error(writeError.message);
  }, []);
  return { items, loading, error, load, save };
}
