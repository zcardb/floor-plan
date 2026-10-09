import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageNumbers } from '../model/projectFilter';

/**
 * 列表分页。hasMore 表示云端还有未加载的数据：此时停在最后一页仍可「下一页」，先加载再翻页。
 * 只有一页且没有更多数据时不渲染。
 */
export function ProjectPagination({ page, pages, hasMore, loading, onPage, onLoadMore }: {
  page: number; pages: number; hasMore: boolean; loading: boolean;
  onPage: (page: number) => void; onLoadMore: () => Promise<unknown>;
}) {
  if (pages <= 1 && !hasMore) return null;
  const atEnd = page >= pages;
  const next = async () => {
    if (atEnd) await onLoadMore();
    onPage(page + 1);
  };
  return <nav className="project-pagination" aria-label="项目分页">
    <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} aria-label="上一页"><ChevronLeft />上一页</Button>
    <ol>{pageNumbers(page, pages).map((n, i) => <li key={n === '…' ? 'gap' + i : n}>
      {n === '…' ? <span aria-hidden="true">…</span> : <Button variant={n === page ? 'outline' : 'ghost'} size="sm" className={n === page ? 'active' : ''} aria-current={n === page ? 'page' : undefined} aria-label={`第 ${n} 页`} disabled={loading} onClick={() => onPage(n)}>{n}</Button>}
    </li>)}</ol>
    <Button variant="ghost" size="sm" loading={loading && atEnd} disabled={(atEnd && !hasMore) || loading} onClick={() => void next()} aria-label="下一页">下一页<ChevronRight /></Button>
  </nav>;
}
