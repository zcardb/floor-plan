import { aabb, snapToStep, wallSnapCandidates } from '@/lib/floor-plan/geometry';
import { guidesFor, snapBoxAxis, type AlignBox, type AlignmentGuide } from './alignment';
import type { Design, Furniture, Point } from '@/lib/floor-plan/types';

export { sameGuides, type AlignmentGuide } from './alignment';

const clean = (v: number) => Math.round(v * 1e6) / 1e6; // strip cos/sin float noise (e.g. rot 90°)
/** 家具在图纸上的轴对齐包围盒（旋转后取外接矩形）。 */
export const furnitureBox = (f: Furniture): AlignBox => { const { hw, hh } = aabb(f); return { c: [f.cx, f.cy], h: [clean(hw), clean(hh)] }; };

/** Move furniture `f` toward raw centre `p`, snapping to walls and to other furniture edges/centres. */
export function snapFurniture(f: Furniture, p: Point, d: Design, snap: boolean, tol: number): { point: Point; guides: AlignmentGuide[] } {
  const grid: Point = [snapToStep(p[0]), snapToStep(p[1])];
  if (!snap) return { point: grid, guides: [] };
  const self = furnitureBox({ ...f, cx: p[0], cy: p[1] });
  const others = d.furniture.filter(o => o.id !== f.id).map(furnitureBox);
  const wall = wallSnapCandidates(f, p, d, tol);
  const point: Point = [...grid];
  const aligned: (0 | 1)[] = [];
  for (const i of [0, 1] as const) {
    const fc = snapBoxAxis(self, others, i, p[i], tol), wc = i === 0 ? wall.x : wall.y;
    if (fc && (!wc || fc.dist <= wc.dist)) { point[i] = fc.v; aligned.push(i); }
    else if (wc) point[i] = wc.v;
  }
  const placed: AlignBox = { c: point, h: self.h };
  return { point, guides: aligned.flatMap(i => guidesFor(placed, others, i)) };
}
