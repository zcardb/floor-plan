import { useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateProjectMenuItems } from './create-project-menu-items';
import { useProjectCreation } from '../hooks/use-project-creation';
import { Logo } from '@/components/logo/logo';
import { ListLoadMore } from '@/components/list-load-more/list-load-more';
import { usePagedList } from '@/hooks/use-paged-list';
import type { PageSource } from '@/lib/paging';
import type { ProjectSummary } from '../hooks/use-projects';
import type { Project } from '@/lib/floor-plan/types';

export interface ProjectNavigation {
  /** 云端项目的列表接口（统一分页）；游客没有云端项目，不传。 */
  cloudProjects?: PageSource<ProjectSummary>;
  /** 不经接口的项目：本机方案与内置模板，排在云端项目之后。 */
  localProjects: ProjectSummary[];
  onOpen: (project: ProjectSummary) => Promise<boolean>;
  /** 登录后可在编辑器内新建项目（与项目管理页同一套方式），成功后切换到新项目。 */
  onCreateProject?: (project: Project) => Promise<boolean>;
  /** 登录后可复制当前项目，成功后进入副本。 */
  onDuplicate?: (project: ProjectSummary) => Promise<boolean>;
}
interface Props extends ProjectNavigation {
  project: ProjectSummary;
  loggedIn: boolean;
  onBack: () => void;
  /** 底部账号区：游客「登录」，已登录显示邮箱 +「退出登录」。不传则不显示。 */
  email?: string;
  loggingOut?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

/**
 * 「切换项目」子菜单里的项目列表（统一分页，一页 20 个，滚到底加载下一页）。
 * 子菜单展开时才挂载，所以每次展开读到的都是最新的云端项目，没展开就不发请求。
 */
export function ProjectSwitchList({ p, pending, onPick }: { p: Props; pending: string | null; onPick: (row: ProjectSummary) => void }) {
  const list = usePagedList<ProjectSummary>({ remote: p.cloudProjects ?? null, local: p.localProjects, key: 'switch' });
  return <div className="project-menu-list" role="group" aria-label={p.loggedIn ? '项目列表' : '内置模板'}>
    {list.list.map(row => {
      const current = row.id === p.project.id || (!p.loggedIn && row.templateId === p.project.templateId);
      return <DropdownMenuItem key={row.id} className="project-menu-option" aria-current={current ? 'true' : undefined}
        disabled={!!pending && !current} onSelect={event => { if (current) event.preventDefault(); else onPick(row); }}>
        <span className="project-menu-name">{row.name}</span>
        <span className="project-menu-date">{pending === row.id ? <Loader2 className="animate-spin" size={13} /> : row.builtin ? '内置模板' : shortDate(row.updatedAt)}</span>
        <span className="project-menu-check">{current && <Check size={14} aria-label="当前项目" />}</span>
      </DropdownMenuItem>;
    })}
    {list.loading && <div className="project-menu-loading" role="status" aria-label="加载项目"><Loader2 className="animate-spin" size={15} /></div>}
    {list.error && <div className="project-menu-error" role="alert">云端项目读取失败<button type="button" onClick={list.reload}>重试</button></div>}
    <ListLoadMore list={list} />
  </div>;
}

/**
 * 工具条左侧：Logo + 当前项目名，同一个点击区。
 * 下拉是一个窄菜单：返回（项目管理）/ 新建项目 ▸ / 切换项目 ▸，后两项悬停展开二级菜单；
 * 分隔线下是账号区（游客「登录」，已登录邮箱 +「退出登录」）。项目的重命名、删除只在项目管理页做，这里不放。
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
      <DropdownMenuContent align="start" className="toolbar-menu project-menu" onCloseAutoFocus={event => { if (creation.dialogOpen) event.preventDefault(); }}>
        {p.loggedIn && <DropdownMenuItem className="project-menu-entry" disabled={busy} onSelect={p.onBack}>返回</DropdownMenuItem>}
        {p.loggedIn && p.onCreateProject && <DropdownMenuSub>
          <DropdownMenuSubTrigger className="project-menu-entry" disabled={busy}>新建项目</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="create-menu" sideOffset={6}>
            <CreateProjectMenuItems actions={creation.actions} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="project-menu-entry">{p.loggedIn ? '切换项目' : '切换户型'}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="toolbar-menu project-switch-menu" sideOffset={6}>
            <ProjectSwitchList p={p} pending={pending} onPick={row => void open(row)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {(p.onLogin || p.onLogout) && <DropdownMenuSeparator />}
        {!p.loggedIn && p.onLogin && <DropdownMenuItem className="project-menu-entry" onSelect={p.onLogin}>登录</DropdownMenuItem>}
        {p.loggedIn && p.onLogout && <>
          {p.email && <DropdownMenuLabel className="project-menu-email" title={p.email}>{p.email}</DropdownMenuLabel>}
          <DropdownMenuItem className="project-menu-entry" disabled={p.loggingOut} onSelect={p.onLogout}>
            退出登录{p.loggingOut && <Loader2 className="animate-spin" />}
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    {creation.dialogs}
  </>;
}
