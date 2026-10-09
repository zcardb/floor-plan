import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * 滚动加载哨兵：滚到列表底部附近时触发 onReach。
 * 依赖 shown 重建观察器，确保一次加载后哨兵仍在视口内时继续触发，直到填满或没有更多。
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
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onReachRef.current(); }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, total, pending, loading]);

  if (!total && !hasMore) return null;
  return <div ref={sentinel} className="project-load-more" role="status" aria-live="polite">
    {pending
      ? <><Loader2 className="animate-spin" />正在加载更多…</>
      : <span>已显示全部 {total} 项</span>}
  </div>;
}
