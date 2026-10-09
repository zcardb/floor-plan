import { bbox } from './geometry';
import { splitWall } from './wallSplit';
import { wallContacts } from './wallContacts';
import type { Design } from './types';

/**
 * 新画墙 wallId 在各方墙上造成的交接切点（mm，自各墙 A 端量起）。
 * 新墙自身取全部交接点（其他墙的端点或中心线落在它身上），其他墙只取来源含新墙的交接点，
 * 因此切点与「分割墙段」对话框列出的接触点完全一致（同样排除洞口内部、两端 50 mm 与合并区间）。
 */
export function junctionCuts(design: Design, wallId: string): Map<string, number[]> {
  const wall = design.walls.find(w => w.id === wallId);
  const cuts = new Map<string, number[]>();
  if (!wall) return cuts;
  const box = bbox([wall.a, wall.b]);
  for (const other of design.walls) {
    if (design.demolished.includes(other.id)) continue;
    // 空白户型的外围墙是可整体重设尺寸的外框，分割后 resizeBlank 会拒绝改尺寸。
    if (design.template === 'blank' && other.kind === 'exterior') continue;
    if (other.id !== wallId) {
      // Cheap pre-filter: walls that cannot touch the drawn one have no junction with it.
      const gap = Math.max(other.thickness, wall.thickness) / 2 + 1;
      const otherBox = bbox([other.a, other.b]);
      if (box.x - gap > otherBox.x2 || otherBox.x - gap > box.x2 || box.y - gap > otherBox.y2 || otherBox.y - gap > box.y2) continue;
    }
    const offsets = wallContacts(design, other.id)
      .filter(c => !c.blocked && (other.id === wallId ? c.wallIds.length > 0 : c.wallIds.includes(wallId)))
      .map(c => c.offset);
    if (offsets.length) cuts.set(other.id, [...new Set(offsets)].sort((a, b) => a - b));
  }
  return cuts;
}

/** 交接点默认分割：新墙与相接、横穿的墙都切成独立墙段；某一段失败时保留该墙原样，不阻塞绘制。 */
export function splitAtJunctions(design: Design, wallId: string): Design {
  let next = design;
  for (const [id, offsets] of junctionCuts(design, wallId)) {
    // 从最远端开始逐个切：原 id 始终留在靠 A 的一段，后续切点仍以原 A 端为基准。
    for (let i = offsets.length - 1; i >= 0; i--) {
      try { next = splitWall(next, id, [offsets[i]!]).design; } catch { break; }
    }
  }
  return next;
}
