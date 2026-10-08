import { notify } from '@/lib/notify';
import type { Design } from '../model/types';

/** 统一执行屋面 / 吊顶修改，失败时提示。 */
export function runSurfaceChange(change: (fn: (d: Design) => Design) => void, fn: (d: Design) => Design, fallback: string) {
  try { change(fn); } catch (e) { notify.fail(e instanceof Error ? e.message : fallback); }
}
