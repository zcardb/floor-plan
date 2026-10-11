import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectDeleteDialog, ProjectRenameDialog } from './ProjectDialogs';
import { ProjectRowActions } from './ProjectRowActions';
import { CreateProjectMenuItems } from './CreateProjectMenuItems';
import { useProjectCreation } from './useProjectCreation';
import { Logo } from './Logo';
import type { ProjectSummary } from '../cloud/useProjects';
import type { Project } from '../model/types';

export interface ProjectNavigation {
  projectList: ProjectSummary[];
  hasMore: boolean;
  listLoading: boolean;
  onOpen: (project: ProjectSummary) => Promise<boolean>;
  onLoadMore: () => void;
  onRename: (project: ProjectSummary, name: string) => Promise<boolean>;
  onRemove: (project: ProjectSummary) => Promise<boolean>;
  /** 登录后可在编辑器内新建项目（与项目管理页同一套方式），成功后切换到新项目。 */
  onCreateProject?: (project: Project) => Promise<boolean>;
  /** 登录后可复制当前项目，成功后进入副本。 */
  onDuplicate?: (project: ProjectSummary) => Promise<boolean>;
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

/** Left of the toolbar: brand logo plus the current project name, in one click target that opens project switching. */
export function ProjectMenu(p: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false), [duplicating, setDuplicating] = useState(false);
  const opening = useRef(false);
  const open = async (row: ProjectSummary) => {
    if (opening.current || row.id === p.project.id) return;
    opening.current = true;
    setPending(row.id);
    try { await p.onOpen(row); } finally { opening.current = false; setPending(null); }
  };
  const duplicate = async () => {
    if (!p.onDuplicate || duplicating) return;
    setDuplicating(true);
    try { await p.onDuplicate(p.project); } finally { setDuplicating(false); }
  };
  // 「复刻当前项目」与「手动创建 / AI 创建 / 导入图纸」并列在同一个「新建项目」子菜单里。
  const creation = useProjectCreation({
    create: p.onCreateProject ?? (async () => false), opened: () => {}, ai: p.loggedIn,
    duplicate: p.onDuplicate && (() => void duplicate()),
  });
  const busy = !!pending || duplicating || creation.importing || creation.submitting;
  const name = p.project.name;
  const rows = p.projectList;
  return <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="project-menu-trigger" aria-label={'项目：' + name} aria-busy={busy}>
          <Logo size={24} />
          <span className="project-menu-title">{name}</span>
          {pending || duplicating || creation.importing ? <Loader2 className="animate-spin" size={14} /> : <ChevronDown size={14} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="project-menu" onCloseAutoFocus={event => { if (renaming || deleting || creation.dialogOpen) event.preventDefault(); }}>
        {p.loggedIn && p.onCreateProject && <>
          {/* 主操作：浅主色底 + 主色图标，悬停展开二级菜单，说明行写清有哪几种新建方式。 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="project-menu-create" disabled={busy}>
              <span className="create-option-icon" aria-hidden="true"><Plus /></span>
              <span className="create-option-text"><b>新建项目</b><small>手动、AI 创建或导入图纸</small></span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="create-menu" sideOffset={6}>
              <CreateProjectMenuItems actions={creation.actions} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
        </>}
        <p className="project-menu-heading">{p.loggedIn ? '切换项目' : '内置模板'}</p>
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
        {p.loggedIn && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onSelect={p.onBack}><ArrowLeft />返回项目管理</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <ProjectRenameDialog project={renaming} onClose={() => setRenaming(null)} onSubmit={p.onRename} />
    <ProjectDeleteDialog project={deleting} current={deleting?.id === p.project.id} onClose={() => setDeleting(null)} onConfirm={p.onRemove} />
    {creation.dialogs}
  </>;
}
