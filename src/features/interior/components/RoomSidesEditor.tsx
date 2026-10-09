import { useEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { formatMeters, meterDraft, resolveMeterDraft } from '../model/lengthUnits';
import { MAX_ROOM_SIDE, MIN_ROOM_SIDE, ROOM_STRUCTURE_LOCKED, editRoomSide, roomSides, type RoomSide, type RoomSideAnchor } from '../model/roomSides';
import type { SizeTransaction } from '../model/sizeTransaction';
import type { Design } from '../model/types';

const FACING_LABEL: Record<RoomSide['facing'], string> = { up: '上侧', right: '右侧', down: '下侧', left: '左侧', slant: '斜边' };
const FACING_NORMAL: Record<RoomSide['facing'], [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0], slant: [0, 0] };
/** 横边的 start 端在左，竖边的 start 端在上。 */
const anchorLabel = (side: RoomSide, anchor: RoomSideAnchor) =>
  side.axis === 1 ? (anchor === 'start' ? '固定上端' : '固定下端') : (anchor === 'start' ? '固定左端' : '固定右端');
const STEP = 10;

interface Editing { token: symbol; index: number; original: number; valid: boolean }

/** 房间逐边尺寸：示意图 + 每条边的长度。输入即实时生效，失焦后合并为一步撤销。 */
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
  const selection = { kind: 'room' as const, id: roomId };

  const anchorOf = (side: RoomSide) => side.fixed ?? anchors[side.index] ?? 'start';
  const setError = (index: number, message: string) => setErrors(previous => {
    if ((previous[index] ?? '') === message) return previous;
    const next = { ...previous };
    if (message) next[index] = message; else delete next[index];
    return next;
  });
  const clearDraft = (index: number) => setDrafts(previous => {
    if (!(index in previous)) return previous;
    const next = { ...previous };
    delete next[index];
    return next;
  });

  /** 结束当前行的编辑：合法 → 一步撤销；非法 → 放弃预览，保留错误提示。 */
  const finish = () => {
    const current = editing.current;
    editing.current = null;
    if (!current) return;
    clearDraft(current.index);
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
  const step = (side: RoomSide, delta: number) => {
    finish();
    const token = transaction.begin(selection);
    const requested = Math.round((side.length + delta) / STEP) * STEP;
    try {
      transaction.updateWith(token, before => editRoomSide(before, roomId, side.index, requested, anchorOf(side)));
      transaction.apply(token);
      setError(side.index, '');
    } catch (error) {
      transaction.cancel(token);
      setError(side.index, error instanceof Error ? error.message : '边长修改失败');
    }
  };
  const switchAnchor = (side: RoomSide) => {
    const next: RoomSideAnchor = anchorOf(side) === 'start' ? 'end' : 'start';
    setAnchors(previous => ({ ...previous, [side.index]: next }));
    const draft = drafts[side.index];
    if (draft !== undefined && editing.current?.index === side.index) preview(side, draft, next);
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
  const locked = design.template !== 'blank' && design.structureUnlocked !== true;
  const xs = sides.map(side => side.a[0]), ys = sides.map(side => side.a[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1), pad = span * 0.16, badge = span * 0.065;

  return <div className="room-sides" onKeyDown={event => event.stopPropagation()}>
    {locked && <p className="visual-locked"><LockKeyhole size={15} />{ROOM_STRUCTURE_LOCKED}</p>}
    <svg className="room-sides-diagram" viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      role="img" aria-label={`房间轮廓示意，共 ${sides.length} 条边`}>
      <polygon className="room-sides-shape" points={sides.map(side => side.a.join(',')).join(' ')} />
      {sides.map(side => <line key={side.index} x1={side.a[0]} y1={side.a[1]} x2={side.b[0]} y2={side.b[1]}
        className={'room-sides-edge' + (active === side.index ? ' is-active' : '') + (side.reason ? ' is-locked' : '')} />)}
      {sides.map(side => {
        const normal = FACING_NORMAL[side.facing];
        const x = (side.a[0] + side.b[0]) / 2 + normal[0] * pad * 0.55, y = (side.a[1] + side.b[1]) / 2 + normal[1] * pad * 0.55;
        return <g key={side.index} className={'room-sides-marker' + (active === side.index ? ' is-active' : '')}
          onPointerDown={event => { event.preventDefault(); inputs.current[side.index]?.focus(); }}>
          <circle cx={x} cy={y} r={badge} />
          <text x={x} y={y} fontSize={badge * 1.2} textAnchor="middle" dominantBaseline="central">{side.index + 1}</text>
        </g>;
      })}
    </svg>
    <div className="room-sides-rows">
      {sides.map(side => {
        const anchor = anchorOf(side), error = errors[side.index];
        return <div key={side.index} className={'room-sides-row' + (active === side.index ? ' is-active' : '')}>
          <span className="room-sides-badge" aria-hidden="true">{side.index + 1}</span>
          <span className="room-sides-label">{FACING_LABEL[side.facing]}</span>
          {side.reason ? <span className="room-sides-field">
            <span className="room-sides-value">{formatMeters(side.length)} m</span>
            <EditorTooltip label={side.reason}>
              <span className="room-sides-locked" role="note" aria-label={side.reason}><LockKeyhole size={13} />锁定</span>
            </EditorTooltip>
          </span> : <>
            <span className="room-sides-field">
              <Input className="editor-control room-sides-input" type="number" min={0.1} max={100} step={0.01} inputMode="decimal"
                aria-label={`第 ${side.index + 1} 条边（${FACING_LABEL[side.facing]}）长度 / m`} aria-invalid={!!error}
                ref={node => { inputs.current[side.index] = node; }}
                value={drafts[side.index] ?? meterDraft(side.length)}
                onFocus={() => setActive(side.index)}
                onChange={event => preview(side, event.target.value, anchor)}
                onBlur={() => { setActive(null); finish(); }}
                onKeyDown={event => {
                  if (event.key === 'Escape') { event.preventDefault(); cancelAll(); }
                  else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                }} />
              <span className="room-sides-steps">
                <button type="button" aria-label={`第 ${side.index + 1} 条边缩短 0.01 m`} disabled={side.length - STEP < MIN_ROOM_SIDE}
                  onClick={() => step(side, -STEP)}><Minus size={13} /></button>
                <button type="button" aria-label={`第 ${side.index + 1} 条边加长 0.01 m`} disabled={side.length + STEP > MAX_ROOM_SIDE}
                  onClick={() => step(side, STEP)}><Plus size={13} /></button>
              </span>
            </span>
            {side.chooseSide
              ? <EditorTooltip label={`改长度时${anchorLabel(side, anchor).slice(2)}不动，点击切换`}>
                <button type="button" className="room-sides-anchor" onPointerDown={event => event.preventDefault()}
                  onClick={() => switchAnchor(side)}>{anchorLabel(side, anchor)}</button>
              </EditorTooltip>
              : <span className="room-sides-anchor is-static">{anchorLabel(side, anchor)}</span>}
          </>}
          {error && <p className="form-error room-sides-error" role="alert">{error}</p>}
        </div>;
      })}
    </div>
    <p className="muted-note">改动即时生效，可撤销。改边长会移动对应的墙，相连的墙和门窗随之调整。</p>
  </div>;
}
