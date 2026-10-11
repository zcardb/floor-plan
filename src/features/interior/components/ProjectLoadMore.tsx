import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/** 最近的纵向滚动容器；列表在页面里滚动时返回 null（以视口为准）。 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

/**
 * 滚动分页：调用方只传当前已显示的条数与总数，滚到列表底部就自动加载下一页，
 * 不需要点击。分页就是按 12 条切：第 2 页是第 12–24 条，第 3 页是第 24–36 条，以此类推，
 * 每页一次，不会因为哨兵一直在视口里而连续补页。
 * 观察根取最近的滚动容器（例如侧栏家具库的列表区），提前 120px 触发。
 */
export function ProjectLoadMore({ shown, total, hasMore, loading, onReach }: {
  shown: number; total: number; hasMore: boolean; loading: boolean; onReach: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const onReachRef = useRef(onReach);
  onReachRef.current = onReach;
  /** 本页只触发一次：避免同一次进入底部因渲染时机被重复计数。 */
  const fired = useRef(false);
  const pending = shown < total || hasMore;

  useEffect(() => {
    fired.current = false;
    const node = sentinel.current;
    if (!node || !pending || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || fired.current) return;
      fired.current = true;
      onReachRef.current();
    }, { root: scrollParent(node), rootMargin: '0px 0px 120px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, total, pending, loading]);

  if (!total && !hasMore) return null;
  return <div ref={sentinel} className={'project-load-more' + (pending ? '' : ' is-done')} role="status" aria-live="polite">
    {pending ? <><Loader2 className="animate-spin" />正在加载更多…</> : <>已加载全部 {total} 条</>}
  </div>;
}
