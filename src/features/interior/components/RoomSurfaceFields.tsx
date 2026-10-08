import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notify';
import { applyRoomCeiling, applyRoomRoof, pickableSurfaces, ROOF_SLOPE_MAX, setRoomRoofSlope } from '../model/hardMaterials';
import type { CustomWall, Design, Room } from '../model/types';
import { EditorSelect } from './EditorSelect';

const NONE = '__none__';
type Props = { design: Design; room: Room; change: (fn: (d: Design) => Design) => void; accountRoofs: CustomWall[]; accountCeilings: CustomWall[] };

/** 房间材质里的屋面（含坡度）与吊顶：只参与硬装计价，不在 2D / 3D 中绘制。 */
export function RoomSurfaceFields({ design, room, change, accountRoofs, accountCeilings }: Props) {
  const slopeId = useId();
  const [slope, setSlope] = useState(String(room.roofSlope ?? 0));
  const options = (kind: 'roof' | 'ceiling', account: CustomWall[], none: string) => [
    { value: NONE, label: none },
    ...pickableSurfaces(design, kind, account).map(({ key, name, fromAccount }) => ({ value: key, label: fromAccount ? `${name} · 账号库` : name })),
  ];
  const run = (fn: (d: Design) => Design, fallback: string) => {
    try { change(fn); } catch (e) { notify.fail(e instanceof Error ? e.message : fallback); }
  };
  const commitSlope = () => {
    const value = Number(slope);
    if (slope.trim() === '' || !Number.isFinite(value) || value < 0 || value > ROOF_SLOPE_MAX) {
      notify.fail(`坡度需在 0～${ROOF_SLOPE_MAX}° 之间`);
      setSlope(String(room.roofSlope ?? 0));
      return;
    }
    if (value !== (room.roofSlope ?? 0)) run(d => setRoomRoofSlope(d, room.id, value), '坡度设置失败');
  };
  return <>
    <EditorSelect label="屋面" value={room.roofMat || NONE} options={options('roof', accountRoofs, '无屋面')}
      onChange={value => run(d => applyRoomRoof(d, room.id, value === NONE ? null : value, accountRoofs), '屋面设置失败')} />
    <div className="editor-field" onKeyDown={event => event.stopPropagation()}>
      <Label htmlFor={slopeId}>屋面坡度 / °</Label>
      <Input id={slopeId} className="editor-control" type="number" min={0} max={ROOF_SLOPE_MAX} step={1} disabled={!room.roofMat}
        value={room.roofMat ? slope : '0'} onChange={e => setSlope(e.target.value)} onBlur={commitSlope}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitSlope(); } }} />
    </div>
    <EditorSelect label="吊顶" value={room.ceilingMat || NONE} options={options('ceiling', accountCeilings, '原顶（无吊顶）')}
      onChange={value => run(d => applyRoomCeiling(d, room.id, value === NONE ? null : value, accountCeilings), '吊顶设置失败')} />
  </>;
}
