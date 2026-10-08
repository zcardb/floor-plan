import { useEffect, useRef, useState } from 'react';
import type { AccountCostSettings } from '../model/costDefaults';

// One applied edit is one version-checked write. Failed edits remain retryable.
export function useAccountCostCommit({ settings, save, onDirty }: {
  settings: AccountCostSettings;
  save: (next: AccountCostSettings) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const [pending, setPending] = useState<AccountCostSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false), epoch = useRef(0);
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => { const counter = epoch; ++counter.current; return () => { counter.current++; }; }, []);
  const submit = async (next: AccountCostSettings): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    const generation = epoch.current;
    setBusy(true); setError(''); setSaved(false); setPending(next); onDirty(true);
    try {
      const success = await save(next);
      if (generation !== epoch.current) return false;
      if (success) { latest.current = next; setPending(null); setSaved(true); onDirty(false); }
      else setError('未能保存，本次修改已保留，请重试。');
      return success;
    } catch (cause) {
      if (generation === epoch.current) setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
      return false;
    } finally {
      if (generation === epoch.current) { lock.current = false; setBusy(false); }
    }
  };
  return { settings: pending || settings, busy, error, saved, pending,
    apply: (update: (current: AccountCostSettings) => AccountCostSettings) => submit(update(pending || latest.current)),
    retry: () => pending ? submit(pending) : Promise.resolve(false),
  };
}
