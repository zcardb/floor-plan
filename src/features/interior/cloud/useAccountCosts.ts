import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { AccountCostSettings } from '../model/costDefaults';
/**
 * 账号默认价：读一次、按版本号写回（乐观并发）。
 *
 * 写入是乐观的：调用 save 时界面立即换成新价（项目内回车改价即刻生效），云端写入在后台串行进行——
 * 上一笔还没写完时排队，不因「忙」直接拒绝；某一笔写失败时回到最后一次确认写入的设置，并返回 false。
 */
export function useAccountCosts(owner?: string) {
  const [settings, setSettings] = useState<AccountCostSettings>({});
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0), revision = useRef<number | null>(null);
  /** 最后一次确认写入云端（或读到）的设置：乐观更新失败时回到这里。 */
  const confirmed = useRef<AccountCostSettings>({});
  /** 串行写入队列与排队中的笔数（只有最后一笔结束时才收起「保存中」）。 */
  const queue = useRef<Promise<unknown>>(Promise.resolve()), queued = useRef(0);
  useEffect(() => {
    const generation=epoch;
    const run = ++epoch.current;
    revision.current = null; confirmed.current = {}; queue.current = Promise.resolve(); queued.current = 0;
    setSettings({}); setError(''); setSaving(false);
    if (!owner) { setLoading(false); return; }
    setLoading(true);
    void Promise.resolve(supabase.from('interior_account_cost_defaults').select('settings,revision').eq('owner_id', owner).maybeSingle()).then(({data,error}) => {
      if (run !== epoch.current) return;
      setLoading(false);
      if (error) { setError(error.message); return; }
      revision.current = data?.revision ?? null;
      confirmed.current = (data?.settings || {}) as AccountCostSettings;
      setSettings(confirmed.current);
    }).catch(cause => {
      if (run !== epoch.current) return;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : '账号成本读取失败，请重试');
    });
    return () => { generation.current++; };
  }, [owner]);
  const save = useCallback((next: AccountCostSettings): Promise<boolean> => {
    if (!owner || loading) return Promise.resolve(false);
    const run = epoch.current;
    setSettings(next); setSaving(true); setError('');
    queued.current++;
    const write = async () => {
      if (run !== epoch.current) return false;
      const rev = revision.current;
      const payload = { settings: next as unknown as Json, revision: (rev ?? -1) + 1, updated_at: new Date().toISOString() };
      try {
        const result = rev === null
          ? await supabase.from('interior_account_cost_defaults').insert({...payload, owner_id: owner}).select('revision').maybeSingle()
          : await supabase.from('interior_account_cost_defaults').update(payload).eq('owner_id',owner).eq('revision',rev).select('revision').maybeSingle();
        if (run !== epoch.current) return false;
        if (result.error || !result.data) throw new Error(result.error?.message || '版本已变化，请刷新后重试；草稿已保留');
        revision.current = result.data.revision; confirmed.current = next;
        return true;
      } catch (cause) {
        if (run !== epoch.current) return false;
        // 后面还有排队的写入时不回滚：它们的设置已包含这一笔，写成功就一并落库
        if (queued.current === 1) setSettings(confirmed.current);
        setError(cause instanceof Error ? cause.message : '保存失败，请重试；修改已保留');
        return false;
      } finally {
        if (run === epoch.current && --queued.current === 0) setSaving(false);
      }
    };
    const task = queue.current.then(write);
    queue.current = task;
    return task;
  }, [owner, loading]);
  return { settings, loading, saving, error, save };
}
