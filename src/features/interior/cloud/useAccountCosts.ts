import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { AccountCostSettings } from '../model/costDefaults';
export function useAccountCosts(owner?: string) {
  const [settings, setSettings] = useState<AccountCostSettings>({});
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0), revision = useRef<number | null>(null), busy = useRef(false);
  useEffect(() => {
    const generation=epoch;
    const run = ++epoch.current;
    revision.current = null; setSettings({}); setError(''); setSaving(false); busy.current = false;
    if (!owner) { setLoading(false); return; }
    setLoading(true);
    void supabase.from('interior_account_cost_defaults').select('settings,revision').eq('owner_id', owner).maybeSingle().then(({data,error}) => {
      if (run !== epoch.current) return;
      setLoading(false);
      if (error) { setError(error.message); return; }
      revision.current = data?.revision ?? null;
      setSettings((data?.settings || {}) as AccountCostSettings);
    });
    return () => { generation.current++; };
  }, [owner]);
  const save = useCallback(async (next: AccountCostSettings) => {
    if (!owner || busy.current || loading) return false;
    busy.current = true; setSaving(true); setError('');
    const run = epoch.current, rev = revision.current;
    const payload = { settings: next as unknown as Json, revision: (rev ?? -1) + 1, updated_at: new Date().toISOString() };
    const result = rev === null
      ? await supabase.from('interior_account_cost_defaults').insert({...payload, owner_id: owner}).select('revision').maybeSingle()
      : await supabase.from('interior_account_cost_defaults').update(payload).eq('owner_id',owner).eq('revision',rev).select('revision').maybeSingle();
    if (run !== epoch.current) return false;
    busy.current = false; setSaving(false);
    if (result.error || !result.data) { setError(result.error?.message || '版本已变化，请刷新后重试；草稿已保留'); return false; }
    revision.current = result.data.revision; setSettings(next); return true;
  }, [owner, loading]);
  return { settings, loading, saving, error, save };
}
