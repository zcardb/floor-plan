import { useMemo } from 'react';
import { enclosedRegions, isRoomSized } from '../model/roomDerive';
import type { Design, Point } from '../model/types';

const ringsPath = (rings: Point[][]) => rings.map(r => 'M' + r.map(p => p.join(',')).join('L') + 'Z').join('');

/**
 * 墙围住但不够房间大小的碎块（墙垛缝、管井）按墙体填充，不露出图纸底色；
 * 房间分隔线画成细虚线，点中可选择。
 */
export function PlanSeparators({ design, selectedId, scale }: { design: Design; selectedId?: string; scale: number }) {
  const { walls, separators, demolished } = design;
  const scraps = useMemo(
    () => enclosedRegions({ ...design, walls, separators, demolished }).filter(r => !isRoomSized(r)),
    // 只随结构变化重算；房间、家具变化不影响碎块。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, separators, demolished],
  );
  return (
    <>
      {scraps.map((rings, i) => (
        <path key={i} d={ringsPath(rings)} fill="var(--plan-wall)" fillRule="evenodd" pointerEvents="none" className="plan-scrap" />
      ))}
      {(separators ?? []).map(s => {
        const selected = s.id === selectedId;
        const line = { x1: s.a[0], y1: s.a[1], x2: s.b[0], y2: s.b[1] };
        return (
          <g key={s.id} data-separator={s.id} className="plan-separator">
            <line {...line} stroke="transparent" strokeWidth={14 / scale} strokeLinecap="round" />
            <line
              {...line}
              stroke={selected ? 'var(--plan-selection)' : 'var(--plan-separator)'}
              strokeWidth={(selected ? 3 : 1.5) / scale}
              strokeDasharray={`${8 / scale} ${5 / scale}`}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </>
  );
}
