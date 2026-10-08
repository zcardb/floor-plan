import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { norm } from '../model/geometry';
import type { SizeTransaction } from '../model/sizeTransaction';

interface Props {
  id: string;
  value: number;
  transaction: SizeTransaction;
  compact?: boolean;
  close?: () => void;
}

export function RotationControls({ id, value, transaction, compact = false, close }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const edit = useRef<{ token: symbol; before: number; text: string; invalid: boolean } | null>(null);
  const active = edit.current && transaction.isActive(edit.current.token);
  const displayed = active && draft !== null ? draft : String(value);
  const settle = () => {
    const current = edit.current;
    edit.current = null;
    if (!current || !transaction.isActive(current.token)) return;
    if (current.invalid) transaction.cancel(current.token);
    else transaction.apply(current.token);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;
  useEffect(() => () => settleRef.current(), []);

  const update = (text: string) => {
    if (!edit.current || !transaction.isActive(edit.current.token)) {
      edit.current = { token: transaction.begin({ kind: 'furniture', id }), before: value, text, invalid: false };
    }
    const current = edit.current;
    current.text = text;
    setDraft(text);
    try {
      transaction.update(current.token, { rot: text });
      current.invalid = false;
      setError('');
    } catch (reason) {
      current.invalid = true;
      setError(reason instanceof Error ? reason.message : '角度无效');
    }
  };
  const rotate = () => {
    const current = edit.current;
    const base = current && transaction.isActive(current.token)
      ? current.invalid ? current.before : norm(Number(current.text))
      : value;
    settle();
    const token = transaction.begin({ kind: 'furniture', id });
    transaction.update(token, { rot: String(norm(base + 90)) });
    transaction.apply(token);
    setDraft(null);
    setError('');
  };
  const cancel = () => {
    if (edit.current) transaction.cancel(edit.current.token);
    edit.current = null;
    setDraft(null);
    setError('');
    close?.();
  };
  return <div className={`rotation-controls${compact ? ' rotation-controls-compact' : ''}`}>
    <div className="rotation-control-row">
      <Button type="button" variant="outline" size="sm" className="editor-action" aria-label="旋转 90°"
        onPointerDown={event => event.preventDefault()} onClick={rotate}><RotateCw size={15} />旋转 90°</Button>
      <label className="rotation-angle-field"><span className={compact ? 'sr-only' : undefined}>旋转 / °</span>
        <span className="rotation-angle-input"><Input className="editor-control" aria-label="旋转 / °" type="number" step={1}
          value={displayed} aria-invalid={active && !!error} onChange={event => update(event.target.value)}
          onBlur={() => { settle(); setDraft(null); setError(''); }} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
          }} /><span className="rotation-angle-unit" aria-hidden="true">°</span></span>
      </label>
    </div>
    {active && error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
