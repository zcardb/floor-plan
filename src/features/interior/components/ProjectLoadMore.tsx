import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** 离哨兵最近的纵向滚动容器（管理端是 `.cms-main`）；找不到时用页面本身。 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

/**
 * 滚动分页：首批只显示调用方给的一页，**用户滚到列表底部**才通知加载下一页，
 * 不提前预取，也不在底部恰好可见时连续自动补页（否则大屏会一次全部铺开，看不出分页）。
 * 页面不够高、无法滚动时，用「加载更多」按钮手动翻页。
 */
export function ProjectLoadMore({ shown, total, hasMore, loading, onReach }: {
  shown: number; total: number; hasMore: boolean; loading: boolean; onReach: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const onReachRef = useRef(onReach);
  onReachRef.current = onReach;
  const pending = shown < total || hasMore;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !pending || loading) return;
    const root = scrollParent(node);
    const target: HTMLElement | Window = root ?? window;
    // 每露出一页后要等用户再滚动一次，才允许触发下一页。
    let scrolled = false;
    const onScroll = () => { scrolled = true; };
    target.addEventListener('scroll', onScroll, { passive: true });
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || !scrolled) return;
      scrolled = false;
      onReachRef.current();
    }, { root, rootMargin: '0px 0px 80px 0px' });
    observer.observe(node);
    return () => { observer.disconnect(); target.removeEventListener('scroll', onScroll); };
  }, [shown, total, pending, loading]);

  if (!total && !hasMore) return null;
  return <div ref={sentinel} className="project-load-more" role="status" aria-live="polite">
    {!pending ? <span>已显示全部 {total} 项</span>
      : loading ? <><Loader2 className="animate-spin" />正在加载更多…</>
      : <Button variant="ghost" size="sm" onClick={() => onReachRef.current()}>加载更多</Button>}
  </div>;
}
