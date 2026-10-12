/** 列表里的一项：仍存在的项，或刚被移除、正在播离场动画的项。 */
export interface Presence<T> { key: string; item: T; leaving: boolean }

/**
 * 新旧列表合并：仍存在的项按新顺序排列；从新列表里消失的项留在原来的位置并标记 leaving，
 * 由界面播完离场动画后再移除。
 */
export function mergePresence<T>(prev: Presence<T>[], next: T[], keyOf: (item: T) => string): Presence<T>[] {
  const out: Presence<T>[] = next.map((item) => ({ key: keyOf(item), item, leaving: false }));
  const kept = new Set(out.map((p) => p.key));
  prev.forEach((p, i) => {
    if (kept.has(p.key)) return;
    // 插回它原来前一项的后面（前一项也消失了就继续往前找），保证离场的项不会跳位置
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const anchor = out.findIndex((o) => o.key === prev[j]!.key);
      if (anchor >= 0) { at = anchor + 1; break; }
    }
    out.splice(at, 0, { ...p, leaving: true });
  });
  return out;
}
