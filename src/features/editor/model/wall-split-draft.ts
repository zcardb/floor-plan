import { wallSplitIntervals } from '@/lib/floor-plan/wall-split';
import type { Design } from '@/lib/floor-plan/types';

/** Distances are typed from the shown A; reversing maps them onto the stored a→b direction. */
export function originalCuts(L: number, distances: number[], reversed: boolean): number[] {
  return reversed ? distances.slice().reverse().map(d => L - d) : distances;
}
/** Result cards are numbered from the shown A, so the picked card maps back to the stored order. */
export function originalSegment(count: number, index: number, reversed: boolean): number {
  return reversed ? count - 1 - index : index;
}
/** A stored a→b offset, expressed as a distance from the shown A. */
export function displayOffset(L: number, offset: number, reversed: boolean): number {
  return reversed ? L - offset : offset;
}
/** Picked junctions, as ascending distances from the shown A so they read like typed input. */
export function contactDistances(L: number, offsets: number[], reversed: boolean): number[] {
  return offsets.map(offset => displayOffset(L, offset, reversed)).sort((a, b) => a - b);
}

export function wallSplitDraft(design: Design, wallId: string, L: number, distances: number[], reversed: boolean) {
  try {
    const cuts = originalCuts(L, distances, reversed);
    return { cuts, intervals: wallSplitIntervals(design, wallId, cuts), error: '' };
  } catch (e) {
    return { cuts: [] as number[], intervals: [] as number[], error: e instanceof Error ? e.message : '分割距离无效' };
  }
}
