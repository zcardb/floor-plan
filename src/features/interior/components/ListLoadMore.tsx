import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { PagedList } from '@/hooks/usePagedList';

/** 最近的纵向滚动容器；列表在页面里滚动时返回 null（以视口为准）。 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

/**
 * 滚动分页的底部哨兵，全站列表共用：滚到列表底部就自动显示下一页，不需要点击。
 * 分页状态来自 `usePagedList`（一页 20 条：第 2 页是第 20–40 条，第 3 页 40–60 条……）。
 * 每页只触发一次，不会因为哨兵一直在视口里而连续补页；读取中不触发。不足一页的列表不显示。
 * 观察根取最近的滚动容器（侧栏列表、切换菜单），提前 120px 触发。
 */
export function ListLoadMore({ list }: { list: Pick<PagedList<unknown>, 'list' | 'pagination' | 'loading' | 'loadingMore' | 'loadMore'> }) {
  const shown = list.list.length, { total, pageSize } = list.pagination;
  const busy = list.loading || list.loadingMore;
  const sentinel = useRef<HTMLDivElement>(null);
  const loadMore = useRef(list.loadMore);
  loadMore.current = list.loadMore;
  /** 本页只触发一次：避免同一次进入底部因渲染时机被重复计数。 */
  const fired = useRef(false);
  const pending = shown < total;

  useEffect(() => {
    fired.current = false;
    const node = sentinel.current;
    if (!node || !pending || busy) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || fired.current) return;
      fired.current = true;
      loadMore.current();
    }, { root: scrollParent(node), rootMargin: '0px 0px 120px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, total, pending, busy]);

  if (total <= pageSize) return null;
  return <div ref={sentinel} className={'list-load-more' + (pending ? '' : ' is-done')} role="status" aria-live="polite">
    {pending ? <><Loader2 className="animate-spin" />正在加载更多…</> : <>已加载全部 {total} 条</>}
  </div>;
}
