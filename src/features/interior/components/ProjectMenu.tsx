import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectDeleteDialog, ProjectRenameDialog } from './ProjectDialogs';
import { ProjectRowActions } from './ProjectRowActions';
import type { ProjectSummary } from '../cloud/useProjects';

export interface ProjectNavigation {
  projectList: ProjectSummary[];
  hasMore: boolean;
  listLoading: boolean;
  onOpen: (project: ProjectSummary) => Promise<boolean>;
  onLoadMore: () => void;
  onRename: (project: ProjectSummary, name: string) => Promise<boolean>;
  onRemove: (project: ProjectSummary) => Promise<boolean>;
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

/** Left of the toolbar: current project name; opens back-to-manager, project switching, rename and delete. */
export function ProjectMenu(p: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const opening = useRef(false);
  const open = async (row: ProjectSummary) => {
    if (opening.current || row.id === p.project.id) return;
    opening.current = true;
    setPending(row.id);
    try { await p.onOpen(row); } finally { opening.current = false; setPending(null); }
  };
  const name = p.project.name;
  const rows = p.projectList;
  return <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="project-menu-trigger" aria-label={'项目：' + name} aria-busy={!!pending}>
          <span>{name}</span>{pending ? <Loader2 className="animate-spin" size={14} /> : <ChevronDown size={14} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="project-menu" onCloseAutoFocus={event => { if (renaming || deleting) event.preventDefault(); }}>
        {p.loggedIn && <>
          <DropdownMenuItem disabled={!!pending} onSelect={p.onBack}><ArrowLeft />返回项目管理</DropdownMenuItem>
          <DropdownMenuSeparator />
        </>}
        <div className="project-menu-list" role="group" aria-label="项目列表">
          {rows.map(row => {
            const current = row.id === p.project.id || (!p.loggedIn && row.templateId === p.project.templateId);
            return <div key={row.id} className="project-menu-row">
              <DropdownMenuItem className="project-menu-option" aria-current={current ? 'true' : undefined}
                disabled={!!pending && !current} onSelect={event => { if (current) event.preventDefault(); else void open(row); }}>
                <span className="project-menu-name">{row.name}</span>
                <span className="project-menu-date">{pending === row.id ? <Loader2 className="animate-spin" size={13} /> : row.builtin ? '内置模板' : shortDate(row.updatedAt)}</span>
                <span className="project-menu-check">{current && <Check size={15} aria-label="当前项目" />}</span>
              </DropdownMenuItem>
              {/* 与项目管理卡片复用同一套操作按钮；先收起下拉再开弹窗，避免两层焦点陷阱冲突。 */}
              {p.loggedIn && <div className="project-menu-actions">
                <ProjectRowActions row={row} disabled={!!pending}
                  onRename={() => { setMenuOpen(false); setRenaming(row); }}
                  onDelete={() => { setMenuOpen(false); setDeleting(row); }} />
              </div>}
            </div>;
          })}
          {p.loggedIn && p.hasMore && <LoadMoreSentinel disabled={p.listLoading} onVisible={p.onLoadMore} />}
          {p.loggedIn && p.listLoading && <div className="project-menu-loading" role="status" aria-label="加载更多项目"><Loader2 className="animate-spin" size={15} /></div>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <ProjectRenameDialog project={renaming} onClose={() => setRenaming(null)} onSubmit={p.onRename} />
    <ProjectDeleteDialog project={deleting} current={deleting?.id === p.project.id} onClose={() => setDeleting(null)} onConfirm={p.onRemove} />
  </>;
}
