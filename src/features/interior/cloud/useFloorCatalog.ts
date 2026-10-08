import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomFloor, FloorPattern } from '../model/types';
import { validCustomFloor } from '../model/floorMaterials';

export function useFloorCatalog() {
  const [items, setItems] = useState<CustomFloor[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current; setLoading(true); setError('');
    let data;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (run !== epoch.current) return;
      if (!session) { setItems([]); setLoading(false); return; }
      const result = await supabase.from('interior_floor_catalog').select('*').order('created_at', { ascending: false }).limit(200);
      if (run !== epoch.current) return;
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      data = result.data;
    } catch (cause) {
      if (run !== epoch.current) return;
      setLoading(false); setError(cause instanceof Error ? cause.message : '地面材质读取失败，请重试');
      return;
    }
    setItems((data || []).map(r => ({
      key: r.floor_key, name: r.name, pattern: r.pattern as FloorPattern, color: r.color,
      price: r.price === null ? null : Number(r.price),
      ...(r.length === null || r.width === null ? {} : { length: Number(r.length), width: Number(r.width) }),
    })).filter(validCustomFloor));
  }, []);
  const save = useCallback(async (floor: CustomFloor) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('请先登录');
    const { error: writeError } = await supabase.from('interior_floor_catalog').upsert({
      owner_id: session.user.id, floor_key: floor.key, name: floor.name, pattern: floor.pattern,
      length: floor.length ?? null, width: floor.width ?? null, color: floor.color, price: floor.price,
    }, { onConflict: 'owner_id,floor_key' });
    if (writeError) throw new Error(writeError.message);
  }, []);
  return { items, loading, error, load, save };
}
