import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

/**
 * 工具条左侧：Logo + 当前项目名，同一个点击区。
 * 下拉是一个窄菜单，只有三项：返回项目管理 / 新建项目 ▸ / 切换项目 ▸，后两项悬停展开二级菜单。
 * 项目的重命名、删除只在项目管理页做，这里不放。
 */
export function ProjectMenu(p: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
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
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="project-menu-trigger" aria-label={'项目：' + name} aria-busy={busy}>
          <Logo size={24} />
          <span className="project-menu-title">{name}</span>
          {busy ? <Loader2 className="animate-spin" size={14} /> : <ChevronDown size={14} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="project-menu" onCloseAutoFocus={event => { if (creation.dialogOpen) event.preventDefault(); }}>
        {p.loggedIn && <DropdownMenuItem className="project-menu-entry" disabled={busy} onSelect={p.onBack}>返回项目管理</DropdownMenuItem>}
        {p.loggedIn && p.onCreateProject && <DropdownMenuSub>
          <DropdownMenuSubTrigger className="project-menu-entry" disabled={busy}>新建项目</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="create-menu" sideOffset={6}>
            <CreateProjectMenuItems actions={creation.actions} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="project-menu-entry">{p.loggedIn ? '切换项目' : '切换户型'}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="project-switch-menu" sideOffset={6}>
            <div className="project-menu-list" role="group" aria-label={p.loggedIn ? '项目列表' : '内置模板'}>
              {p.projectList.map(row => {
                const current = row.id === p.project.id || (!p.loggedIn && row.templateId === p.project.templateId);
                return <DropdownMenuItem key={row.id} className="project-menu-option" aria-current={current ? 'true' : undefined}
                  disabled={!!pending && !current} onSelect={event => { if (current) event.preventDefault(); else void open(row); }}>
                  <span className="project-menu-name">{row.name}</span>
                  <span className="project-menu-date">{pending === row.id ? <Loader2 className="animate-spin" size={13} /> : row.builtin ? '内置模板' : shortDate(row.updatedAt)}</span>
                  <span className="project-menu-check">{current && <Check size={14} aria-label="当前项目" />}</span>
                </DropdownMenuItem>;
              })}
              {p.loggedIn && p.hasMore && <LoadMoreSentinel disabled={p.listLoading} onVisible={p.onLoadMore} />}
              {p.loggedIn && p.listLoading && <div className="project-menu-loading" role="status" aria-label="加载更多项目"><Loader2 className="animate-spin" size={15} /></div>}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
    {creation.dialogs}
  </>;
}
