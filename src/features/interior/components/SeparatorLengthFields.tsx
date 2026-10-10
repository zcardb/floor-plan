import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import { resizeSeparator, separatorEndAttached, separatorLength } from '../model/separators';
import type { SizeTransaction } from '../model/sizeTransaction';
import type { Design, Separator } from '../model/types';

type End = 'a' | 'b';

/** 两端按图纸方位命名：横线为左 / 右端，竖线为上 / 下端。 */
function endNames(s: Separator): Record<End, string> {
  const vertical = Math.abs(s.b[1] - s.a[1]) > Math.abs(s.b[0] - s.a[0]);
  const aFirst = vertical ? s.a[1] <= s.b[1] : s.a[0] <= s.b[0];
  const [first, second] = vertical ? ['上端', '下端'] : ['左端', '右端'];
  return aFirst ? { a: first, b: second } : { a: second, b: first };
}

/**
 * 分隔线长度：先选固定的一端，再输入长度，另一端沿分隔线方向伸缩。
 * 与 SizeFields 同一套事务：输入即预览，失焦 / 关闭合并成一步撤销，非法输入回滚。
 */
export function SeparatorLengthFields({ design, separator, transaction, close }: {
  design: Design; separator: Separator; transaction: SizeTransaction; close?: () => void;
}) {
  const names = endNames(separator);
  const [anchor, setAnchor] = useState<End>(() =>
    separatorEndAttached(design, separator, 'a') ? 'a' : separatorEndAttached(design, separator, 'b') ? 'b' : 'a');
  const length = separatorLength(separator);
  const [draft, setDraft] = useState(() => meterDraft(length));
  const [error, setError] = useState('');
  const token = useRef<symbol | null>(null);
  // 没在输入时，长度跟随画布拖动等其他改动刷新。
  useEffect(() => { if (!token.current) setDraft(meterDraft(length)); }, [length]);

  const settle = (silent = false) => {
    const t = token.current;
    token.current = null;
    if (!t) return;
    if (error) {
      transaction.cancel(t);
      if (!silent) { setError(''); setDraft(meterDraft(length)); }
    } else transaction.apply(t);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;
  useEffect(() => () => settleRef.current(true), []);

  const edit = (value: string) => {
    setDraft(value);
    if (!token.current || !transaction.isActive(token.current)) token.current = transaction.begin({ kind: 'separator', id: separator.id });
    try {
      transaction.updateWith(token.current, before => {
        const mm = parseMeterDraft(value);
        if (Number.isNaN(mm)) throw new Error('请输入长度');
        return resizeSeparator(before, separator.id, mm, anchor);
      });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '长度无效');
    }
  };
  const cancel = () => {
    const t = token.current;
    token.current = null;
    if (t) transaction.cancel(t);
    setError('');
    close?.();
  };

  return (
    <div className="separator-length-fields" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } }}>
      <div className="field-label">
        固定端
        <div className="wall-split-segmented" role="group" aria-label="固定端">
          {(['a', 'b'] as const).map(end => (
            <button key={end} type="button" aria-pressed={anchor === end} className={anchor === end ? 'is-active' : ''} onClick={() => setAnchor(end)}>
              {names[end]}
            </button>
          ))}
        </div>
      </div>
      <Label className="field-label">
        长度 / m
        <Input className="editor-control" aria-label="分隔线长度 / m" type="number" step={0.01} min={0.02} value={draft}
          onChange={e => edit(e.target.value)} onBlur={() => settle()}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      </Label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="muted-note">{names[anchor]}不动，{names[anchor === 'a' ? 'b' : 'a']}伸缩。拖动画布上的两端圆点或整条线也能直接调整；分隔线只划分房间，不进 3D、不计价。</p>
    </div>
  );
}
