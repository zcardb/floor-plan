import { useEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { formatMeters, meterDraft, resolveMeterDraft } from '@/lib/floor-plan/length-units';
import { editRoomSide, roomSides, type RoomSide, type RoomSideAnchor } from '../model/room-sides';
import type { SizeTransaction } from '../model/size-transaction';
import type { Design } from '@/lib/floor-plan/types';
import { RoomSidesDiagram } from './room-sides-diagram';

/** 横边的 start 端在左，竖边的 start 端在上。 */
const endName = (side: RoomSide, anchor: RoomSideAnchor) =>
  side.axis === 1 ? (anchor === 'start' ? '上端' : '下端') : (anchor === 'start' ? '左端' : '右端');

interface Editing { token: symbol; index: number; original: number; valid: boolean }

/** 工具条「尺寸」弹层：左侧轮廓预览，右侧逐边长度输入；两侧选中互相高亮。输入即实时生效，失焦后合并为一步撤销。 */
export function RoomSidesEditor({ design, roomId, transaction, close }: {
  design: Design;
  roomId: string;
  transaction: SizeTransaction;
  close?: () => void;
}) {
  const sides = useMemo(() => roomSides(design, roomId), [design, roomId]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [anchors, setAnchors] = useState<Record<number, RoomSideAnchor>>({});
  const [active, setActive] = useState<number | null>(null);
  const editing = useRef<Editing | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const rows = useRef<Record<number, HTMLDivElement | null>>({});
  const selection = { kind: 'room' as const, id: roomId };

  const anchorOf = (side: RoomSide) => side.fixed ?? anchors[side.index] ?? 'start';
  const setError = (index: number, message: string) => setErrors(previous => {
    if ((previous[index] ?? '') === message) return previous;
    const next = { ...previous };
    if (message) next[index] = message; else delete next[index];
    return next;
  });

  /** 结束当前边的编辑：合法 → 一步撤销；非法 → 放弃预览，保留错误提示。 */
  const finish = () => {
    const current = editing.current;
    editing.current = null;
    if (!current) return;
    setDrafts(previous => {
      if (!(current.index in previous)) return previous;
      const next = { ...previous };
      delete next[current.index];
      return next;
    });
    if (!transaction.isActive(current.token)) return;
    if (current.valid) transaction.apply(current.token);
    else transaction.cancel(current.token);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => () => finishRef.current(), []);

  const preview = (side: RoomSide, text: string, anchor: RoomSideAnchor) => {
    let current = editing.current;
    if (!current || current.index !== side.index || !transaction.isActive(current.token)) {
      finish();
      current = editing.current = { token: transaction.begin(selection), index: side.index, original: side.length, valid: false };
    }
    setDrafts(previous => ({ ...previous, [side.index]: text }));
    const requested = resolveMeterDraft(text, current.original);
    try {
      transaction.updateWith(current.token, before => {
        if (!Number.isFinite(requested)) throw new Error('请输入有效的边长');
        return editRoomSide(before, roomId, side.index, requested, anchor);
      });
      current.valid = true;
      setError(side.index, '');
    } catch (error) {
      current.valid = false;
      setError(side.index, error instanceof Error ? error.message : '边长修改失败');
    }
  };
  const pick = (index: number) => {
    setActive(index);
    const input = inputs.current[index];
    if (input) input.focus();
    rows.current[index]?.scrollIntoView({ block: 'nearest' });
  };
  const setAnchor = (side: RoomSide, anchor: RoomSideAnchor) => {
    setAnchors(previous => ({ ...previous, [side.index]: anchor }));
    const draft = drafts[side.index];
    if (draft !== undefined && editing.current?.index === side.index) preview(side, draft, anchor);
  };
  const cancelAll = () => {
    const current = editing.current;
    editing.current = null;
    if (current && transaction.isActive(current.token)) transaction.cancel(current.token);
    setDrafts({});
    setErrors({});
    close?.();
  };

  if (!sides.length) return null;
  const current = active === null ? undefined : sides[active];

  return <div className="room-sides" onKeyDown={event => event.stopPropagation()}>
    <div className="room-sides-preview">
      <RoomSidesDiagram sides={sides} labels="index" active={active} onPick={pick} />
      <div className="room-sides-anchor" aria-live="polite">
        {!current ? <span>点选左图的边或右侧输入框</span>
          : current.reason ? <span>第 {current.index + 1} 条边已锁定</span>
          : current.chooseSide ? <span className="room-sides-anchor-group">
            <span>改第 {current.index + 1} 条边时保持</span>
            <span className="room-sides-anchor-toggle" role="group" aria-label="固定端">
              {(['start', 'end'] as const).map(anchor => <button key={anchor} type="button" aria-pressed={anchorOf(current) === anchor}
                onPointerDown={event => event.preventDefault()} onClick={() => setAnchor(current, anchor)}>{endName(current, anchor)}</button>)}
            </span>
            <span>不动</span>
          </span>
          : <span>第 {current.index + 1} 条边：{endName(current, anchorOf(current))}为固定结构，另一端移动</span>}
      </div>
    </div>
    <div className="room-sides-list">
      {sides.map(side => {
        const error = errors[side.index], on = active === side.index;
        return <div key={side.index} ref={node => { rows.current[side.index] = node; }}
          className={'room-sides-row' + (on ? ' is-active' : '') + (side.reason ? ' is-locked' : '')}
          onPointerDown={() => setActive(side.index)}>
          <span className="room-sides-badge" aria-hidden="true">{side.index + 1}</span>
          {side.reason
            ? <EditorTooltip label={side.reason}>
              <span className="room-sides-value" role="note" aria-label={`第 ${side.index + 1} 条边 ${formatMeters(side.length)} m，${side.reason}`}>
                {formatMeters(side.length)}<LockKeyhole size={12} />
              </span>
            </EditorTooltip>
            : <Input className="editor-control room-sides-input" type="number" min={0.1} max={100} step={0.01} inputMode="decimal"
              aria-label={`第 ${side.index + 1} 条边长度 / m`} aria-invalid={!!error}
              ref={node => { inputs.current[side.index] = node; }}
              value={drafts[side.index] ?? meterDraft(side.length)}
              onFocus={() => setActive(side.index)}
              onChange={event => preview(side, event.target.value, anchorOf(side))}
              onBlur={finish}
              onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); cancelAll(); }
                else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
              }} />}
          <span className="room-sides-unit">m</span>
          {error && <p className="form-error room-sides-error" role="alert">{error}</p>}
        </div>;
      })}
    </div>
  </div>;
}
