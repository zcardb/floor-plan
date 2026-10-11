import { useEffect, useRef, useState } from 'react';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

type Chip = { id: string; label: string; meta?: string };

/**
 * 单行分类胶囊：超出宽度时横向滚动。
 * 两侧渐隐只在该方向还有内容时出现；选中项自动滚入视野；鼠标纵向滚轮在溢出时转为横向滚动。
 */
export function CmsFilterBar({ chips, value, onChange, label = '分类筛选', className }: { chips: Chip[]; value: string; onChange: (id: string) => void; label?: string; /** 尺寸变体，例如侧栏里的紧凑版 `library-categories`。 */ className?: string }) {
  const ref = useRef<HTMLDivElement>(null), [edges, setEdges] = useState({ start: false, end: false });
  const count = (meta?: string) => meta ? meta.replace(/\D+/g, '') || meta : meta;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const next = { start: el.scrollLeft > 1, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      setEdges(prev => prev.start === next.start && prev.end === next.end ? prev : next);
    };
    const wheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((event.deltaY < 0 && el.scrollLeft <= 0) || (event.deltaY > 0 && el.scrollLeft >= max)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(el);
    return () => { el.removeEventListener('scroll', sync); el.removeEventListener('wheel', wheel); observer?.disconnect(); };
  }, [chips.length]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [value]);
  return <div ref={ref} className={className ? `cms-filter-bar ${className}` : 'cms-filter-bar'} role="group" aria-label={label} data-fade-start={edges.start || undefined} data-fade-end={edges.end || undefined}>
    {chips.map(c => <EditorTooltip key={c.id} label={c.label}>
      <button type="button" className={c.id === value ? 'active' : ''} aria-pressed={c.id === value} onClick={() => onChange(c.id)}>{c.label}{c.meta && <b>{c.meta}</b>}</button>
    </EditorTooltip>)}
  </div>;
}
