import type { Opening } from '@/lib/floor-plan/types';
import { doorOrientation, type DoorOrientation } from '@/lib/floor-plan/door-orientation';
import { doorType } from '@/lib/floor-plan/door-type';
import { PanelSegmented } from './panel-segmented';

/**
 * 门开向：紧凑的分段控件（比下拉更小，选项一眼看全、点一下就改）。
 * 双开门两侧都有铰链，只留开启侧；推拉门没有开向（工具条上不显示入口）。
 */
export function DoorOrientationControls({ door, onChange }: { door: Opening; onChange: (patch: DoorOrientation) => void }) {
  if (door.kind !== 'door' || doorType(door) === 'sliding') return null;
  const { hinge, swingSide } = doorOrientation(door);
  return <div className="door-orientation-controls">
    {doorType(door) === 'single' && <>
      <span>铰链侧</span>
      <PanelSegmented label="铰链侧" value={hinge} options={[{ value: 'start', label: '左' }, { value: 'end', label: '右' }]}
        onChange={value => onChange({ hinge: value as Opening['hinge'] })} />
    </>}
    <span>开启侧</span>
    <PanelSegmented label="开启侧" value={swingSide} options={[{ value: -1, label: '一侧' }, { value: 1, label: '另一侧' }]}
      onChange={value => onChange({ swingSide: value as -1 | 1 })} />
  </div>;
}
