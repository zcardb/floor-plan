import { area, bbox, perim } from './geometry';
import type { Room } from './types';

/** 房间概要指标：净使用面积（m²，扣除内环）、周长（m）、开间 / 进深（外接矩形宽 / 深，mm）。 */
export function roomMetrics(r: Room) {
  const b = bbox(r.rings[0]);
  return { area: area(r), perimeter: perim(r), width: b.x2 - b.x, depth: b.y2 - b.y };
}
