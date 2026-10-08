import type { Opening } from '../model/types';
import { doorOrientation, type DoorOrientation } from '../model/doorOrientation';
import { EditorSelect } from './EditorSelect';
export function DoorOrientationControls({ door, onChange }: { door: Opening; onChange: (patch: DoorOrientation) => void }) {
  if (door.kind !== 'door') return null;
  const { hinge, swingSide } = doorOrientation(door);
  return <div className="door-orientation-controls">
    <EditorSelect label="铰链侧" value={hinge} options={[{ value: 'start', label: '左侧 · 沿墙起点侧' }, { value: 'end', label: '右侧 · 沿墙终点侧' }]} onChange={value => onChange({ hinge: value as Opening['hinge'] })} />
    <EditorSelect label="开启侧" value={String(swingSide)} options={[{ value: '-1', label: '墙体一侧' }, { value: '1', label: '墙体另一侧' }]} onChange={value => onChange({ swingSide: Number(value) as -1 | 1 })} />
  </div>;
}
