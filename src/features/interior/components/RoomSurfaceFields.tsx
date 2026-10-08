import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notify';
import { applyRoomCeiling, applyRoomRoof, pickableSurfaces, ROOF_SLOPE_MAX, setRoomRoofSlope } from '../model/hardMaterials';
import type { CustomWall, Design, Room } from '../model/types';
import { EditorSelect } from './EditorSelect';
import { runSurfaceChange } from './runSurfaceChange';

const NONE = '__none__';
export type RoomSurfaceProps = { design: Design; room: Room; change: (fn: (d: Design) => Design) => void; accountRoofs: CustomWall[]; accountCeilings: CustomWall[] };

/** 屋面坡度输入：失焦或回车提交，越界时提示并还原。 */
export function RoofSlopeInput({ room, change, className }: Pick<RoomSurfaceProps, 'room' | 'change'> & { className?: string }) {
  const id = useId(), current = room.roofSlope ?? 0;
  const [draft, setDraft] = useState(String(current));
  const commit = () => {
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(value) || value < 0 || value > ROOF_SLOPE_MAX) {
      notify.fail(`坡度需在 0～${ROOF_SLOPE_MAX}° 之间`);
      setDraft(String(current));
      return;
    }
    if (value !== current) runSurfaceChange(change, d => setRoomRoofSlope(d, room.id, value), '坡度设置失败');
  };
  return <div className={className ?? 'editor-field'} onKeyDown={event => event.stopPropagation()}>
    <Label htmlFor={id}>屋面坡度 / °（0 为平顶）</Label>
    <Input id={id} className="editor-control" type="number" min={0} max={ROOF_SLOPE_MAX} step={1}
      value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  </div>;
}

/** 房间材质弹层里的屋面 / 坡度 / 吊顶：没有屋面时不展示坡度与吊顶。 */
export function RoomSurfaceFields({ design, room, change, accountRoofs, accountCeilings }: RoomSurfaceProps) {
  const options = (kind: 'roof' | 'ceiling', account: CustomWall[], none: string) => [
    { value: NONE, label: none },
    ...pickableSurfaces(design, kind, account).map(({ key, name, fromAccount }) => ({ value: key, label: fromAccount ? `${name} · 账号库` : name })),
  ];
  return <>
    <EditorSelect label="屋面" value={room.roofMat || NONE} options={options('roof', accountRoofs, '无屋面')}
      onChange={value => runSurfaceChange(change, d => applyRoomRoof(d, room.id, value === NONE ? null : value, accountRoofs), '屋面设置失败')} />
    {room.roofMat && <>
      <RoofSlopeInput key={room.id + ':' + (room.roofSlope ?? 0)} room={room} change={change} />
      <EditorSelect label="吊顶" value={room.ceilingMat || NONE} options={options('ceiling', accountCeilings, '原顶（无吊顶）')}
        onChange={value => runSurfaceChange(change, d => applyRoomCeiling(d, room.id, value === NONE ? null : value, accountCeilings), '吊顶设置失败')} />
    </>}
  </>;
}
