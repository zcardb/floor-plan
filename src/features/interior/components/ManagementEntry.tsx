import { useEffect, useState, type ReactNode } from 'react';
import { ManagementLoading } from './ManagementLoading';

// Key this boundary by menu: initial reads block entry, subsequent reads keep drafts mounted.
export function ManagementEntry({ loading, label, load, reset, children }: {
  loading: boolean; label: string; load?: () => Promise<void>; reset?: () => void; children: ReactNode;
}) {
  const [settled, setSettled] = useState(!load);
  const [displayed, setDisplayed] = useState(false);
  useEffect(() => {
    let current = true;
    if (load) void load().finally(() => { if (current) setSettled(true); });
    return () => { current = false; reset?.(); };
  }, [load, reset]);
  const ready = settled && !loading;
  if (ready && !displayed) setDisplayed(true);
  return displayed || ready ? children : <ManagementLoading heading label={label}/>;
}
