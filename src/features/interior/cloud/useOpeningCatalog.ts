import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomOpening } from '../model/types';
import { validCustomOpening } from '../model/hardMaterials';

/** 账号门窗库：与账号地面库同构，仅本人可读写。 */
export function useOpeningCatalog() {
  const [items, setItems] = useState<CustomOpening[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const run = ++epoch.current; setLoading(true); setError('');
    let data;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (run !== epoch.current) return;
      if (!session) { setItems([]); setLoading(false); return; }
      const result = await supabase.from('interior_opening_catalog').select('*').order('created_at', { ascending: false }).limit(200);
      if (run !== epoch.current) return;
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      data = result.data;
    } catch (cause) {
      if (run !== epoch.current) return;
      setLoading(false); setError(cause instanceof Error ? cause.message : '门窗款式读取失败，请重试');
      return;
    }
    setItems((data || []).map(r => ({
      key: r.opening_key, name: r.name, kind: r.kind as CustomOpening['kind'],
      width: Number(r.width), height: Number(r.height), price: r.price === null ? null : Number(r.price),
    })).filter(validCustomOpening));
  }, []);
  const save = useCallback(async (opening: CustomOpening) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('请先登录');
    const { error: writeError } = await supabase.from('interior_opening_catalog').upsert({
      owner_id: session.user.id, opening_key: opening.key, name: opening.name, kind: opening.kind,
      width: opening.width, height: opening.height, price: opening.price,
    }, { onConflict: 'owner_id,opening_key' });
    if (writeError) throw new Error(writeError.message);
  }, []);
  return { items, loading, error, load, save };
}
