import { formatMeters } from '../model/lengthUnits';
import { roomMetrics } from '../model/roomMetrics';
import type { Room } from '../model/types';

/** 房间概要指标：小字只读信息行（工具条「房间尺寸」弹层标题下方）。 */
export function RoomMetrics({ room }: { room: Room }) {
  const m = roomMetrics(room);
  const items: [string, string, string][] = [
    ['净使用面积', m.area.toFixed(2), 'm²'],
    ['周长', m.perimeter.toFixed(1), 'm'],
    ['开间', formatMeters(m.width), 'm'],
    ['进深', formatMeters(m.depth), 'm'],
  ];
  return <dl className="room-metrics" aria-label="房间概要">
    {items.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}<small>{unit}</small></dd></div>)}
  </dl>;
}
