import { length } from '../model/geometry';
import type { Design } from '../model/types';
import { WallRangeDimensions } from './WallRangeDimensions';

export function OpeningDistances({ design, openingId, scale }: { design: Design; openingId: string; scale: number }) {
  const opening = design.openings.find(o => o.id === openingId);
  const wall = opening && design.walls.find(w => w.id === opening.wallId);
  if (!opening || !wall) return null;
  const total = length(wall);
  const ranges: [number, number][] = [[0, opening.offset - opening.width / 2], [opening.offset + opening.width / 2, total]];
  // Keep labels horizontal and on separate rows when the opening is small on screen.
  return <WallRangeDimensions wall={wall} ranges={ranges} scale={scale} stagger={opening.width * scale < 120} label="门窗两侧墙端距离" />;
}
