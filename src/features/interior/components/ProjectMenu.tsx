import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectSummary } from '../cloud/useProjects';

export interface ProjectNavigation {
  projectList: ProjectSummary[];
  hasMore: boolean;
  listLoading: boolean;
  onOpen: (project: ProjectSummary) => Promise<boolean>;
  onLoadMore: () => void;
}
interface Props extends ProjectNavigation {
  project: ProjectSummary;
  loggedIn: boolean;
  onBack: () => void;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

/** Triggers `onVisible` when scrolled into view inside its scroll container. */
export function LoadMoreSentinel({ disabled, onVisible }: { disabled: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null), latest = useRef(onVisible);
  useEffect(() => { latest.current = onVisible; });
  useEffect(() => {
    const node = ref.current;
    if (!node || disabled || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) latest.current(); },
      { root: node.parentElement, rootMargin: '0px 0px 40px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled]);
  return <div ref={ref} className="project-menu-sentinel" aria-hidden="true" />;
}

/** Left of the toolbar: current project name; opens back-to-manager, project switching, or guest cloud save. */
export function ProjectMenu(p: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const opening = useRef(false);
  const open = async (row: ProjectSummary) => {
    if (opening.current || row.id === p.project.id) return;
    opening.current = true;
    setPending(row.id);
    try { await p.onOpen(row); } finally { opening.current = false; setPending(null); }
  };
  const name = p.loggedIn ? p.project.name : '参考户型';
  const rows = p.loggedIn ? p.projectList : [p.project];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="project-menu-trigger" aria-label={'项目：' + name} aria-busy={!!pending}>
        <span>{name}</span>{pending ? <Loader2 className="animate-spin" size={14} /> : <ChevronDown size={14} />}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="project-menu">
      {p.loggedIn && <>
        <DropdownMenuItem disabled={!!pending} onSelect={p.onBack}><ArrowLeft />返回项目管理</DropdownMenuItem>
        <DropdownMenuSeparator />
      </>}
      <div className="project-menu-list" role="group" aria-label="项目列表">
        {rows.map(row => {
          const current = row.id === p.project.id;
          return <DropdownMenuItem key={row.id} className="project-menu-option" aria-current={current ? 'true' : undefined}
            disabled={!!pending && !current} onSelect={event => { if (current) event.preventDefault(); else void open(row); }}>
            <span className="project-menu-name">{p.loggedIn ? row.name : name}</span>
            <span className="project-menu-date">{pending === row.id ? <Loader2 className="animate-spin" size={13} /> : shortDate(row.updatedAt)}</span>
            <span className="project-menu-check">{current && <Check size={15} aria-label="当前项目" />}</span>
          </DropdownMenuItem>;
        })}
        {p.loggedIn && p.hasMore && <LoadMoreSentinel disabled={p.listLoading} onVisible={p.onLoadMore} />}
        {p.loggedIn && p.listLoading && <div className="project-menu-loading" role="status" aria-label="加载更多项目"><Loader2 className="animate-spin" size={15} /></div>}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}
