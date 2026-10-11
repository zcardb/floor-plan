import { useState } from 'react';
import { ManagementLoading, ProjectCardsSkeleton } from './ManagementLoading';
import { LoadError } from './LoadError';
import { Plus, LayoutTemplate, LayoutGrid, RefreshCw, Loader2, ChevronDown, Search, X } from 'lucide-react';
import { CmsPageHeader } from './CmsPageHeader';
import { CmsSearchField } from './CmsSearchField';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectRenameDialog, ProjectDeleteDialog } from './ProjectDialogs';
import { CreateProjectMenuItems } from './CreateProjectMenuItems';
import { useProjectCreation } from './useProjectCreation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject, TEMPLATE_PRESETS } from '../data/templates';
import { ProjectCard } from './ProjectCard';
import { PlanThumbnail, PresetThumbnail } from './PlanThumbnail';
import { mineCardActions, templateCardActions } from './projectCardActions';
import { CmsFilterGroup } from './CmsFilterGroup';
import { ProjectLoadMore } from './ProjectLoadMore';
import { filterProjects, visibleEntries, PROJECT_SCOPES, type ProjectScope } from '../model/projectFilter';
import type { useProjects, ProjectSummary } from '../cloud/useProjects';

type Projects = ReturnType<typeof useProjects>;
/** 滚动加载的批次：先展示 12 条，滚到底部再补下一批。 */
const PAGE_SIZE = 12;
const SCOPE_TITLE: Record<ProjectScope, string> = { all: '全部项目', builtin: '内置模板', mine: '我的项目' };
type RowKind = 'open' | 'duplicate' | 'remove' | 'copyTemplate';
const BUSY_LABEL: Record<RowKind, string> = { open: '正在打开…', duplicate: '正在复制…', remove: '正在删除…', copyTemplate: '正在复制…' };

export function ProjectManager({ projects, opened }: { projects: Projects; opened: () => void }) {
  const [rename, setRename] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [scope, setScopeState] = useState<ProjectScope>('all'), [query, setQueryState] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE), [refreshing, setRefreshing] = useState(false);
  const setScope = (next: ProjectScope) => { setScopeState(next); setVisible(PAGE_SIZE); };
  const setQuery = (next: string) => { setQueryState(next); setVisible(PAGE_SIZE); };
  const resetFilter = () => { setScopeState('all'); setQueryState(''); setVisible(PAGE_SIZE); };
  const list: ProjectSummary[] = [
    ...projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false, system: g.system === true })),
    ...projects.cloud,
  ];
  const entries = filterProjects(TEMPLATE_PRESETS, list, scope, query);
  // 云端还有未加载的项目时，数量只代表已加载部分，用「N+」提示。
  const more = projects.hasMore && scope !== 'builtin';
  const shown = visibleEntries(entries, visible, more);
  const counts: Record<ProjectScope, string> = {
    all: TEMPLATE_PRESETS.length + list.length + (projects.hasMore ? '+' : ''),
    builtin: String(TEMPLATE_PRESETS.length),
    mine: list.length + (projects.hasMore ? '+' : ''),
  };
  const searching = query.trim() !== '';
  const filtered = searching || scope !== 'all';
  /**
   * 滚到底部：先补一批已加载的项目；窗口已经盖住当前数据时才向云端要下一批。
   * 云端失败或仍在请求时不自动续加载，交给「重试」处理，避免反复无效请求。
   */
  const loadMore = (available: number) => {
    if (visible < available) { setVisible(visible + PAGE_SIZE); return; }
    if (more && !projects.loading && !projects.listError) {
      setVisible(visible + PAGE_SIZE);
      void projects.loadMore();
    }
  };
  /** 刷新：清空可见窗口并把整个列表切回加载态，用骨架屏替换旧内容。 */
  const refresh = async () => {
    setRefreshing(true);
    setVisible(PAGE_SIZE);
    try { await projects.reload(); } finally { setRefreshing(false); }
  };

  // 卡片级操作共用一把锁：同一时间只处理一个项目，避免打开/复制/删除互相打架。
  const rowAction = useAsyncAction(
    async (kind: RowKind, row: ProjectSummary) => {
      if (kind === 'open') { if (await projects.open(row)) opened(); return; }
      if (kind === 'duplicate') { if (await projects.duplicate(row)) opened(); return; }
      if (kind === 'copyTemplate') {
        // 「用模板新建」即复制：直接生成一份可编辑的云端副本并打开，和复制我的项目同一流程。
        const name = row.name + ' · 副本';
        if (await projects.create(createProject(row.templateId, name), true)) { notify.success('已复制为「' + name + '」'); opened(); }
        return;
      }
      return projects.remove(row);
    },
    (kind, row) => kind + ':' + row.id,
  );
  const creation = useProjectCreation({ create: project => projects.create(project, true), opened, ai: !!projects.session });
  const createBusy = rowAction.pending || creation.importing;
  const busyLabel = (row: ProjectSummary) => {
    const [kind, id] = rowAction.pendingKey?.split(/:(.*)/) ?? [];
    return id === row.id ? BUSY_LABEL[kind as RowKind] : undefined;
  };
  const guestStates = new Map(projects.guests.map(g => [g.id, g.state]));
  const loadingList = refreshing || (projects.loading && !rowAction.pending);

  return <>
    <CmsPageHeader title="项目管理" description="把每个空间的灵感，保存成独立方案。"
      search={<CmsSearchField label="搜索项目" placeholder="搜索项目名称、户型…" value={query} onChange={setQuery} loading={projects.loading} loadingLabel="加载项目" matchCount={entries.length} />}
      actions={<>
        <EditorTooltip label="刷新" disabled={loadingList}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={loadingList} aria-busy={loadingList} onClick={() => void refresh()}><RefreshCw className={loadingList ? 'animate-spin' : ''} /></Button>
        </EditorTooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="cms-create-button" disabled={createBusy} aria-busy={creation.reading}>
              {creation.reading ? <Loader2 className="animate-spin" /> : <Plus />}新建项目<ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="create-menu">
            <CreateProjectMenuItems actions={creation.actions} />
          </DropdownMenuContent>
        </DropdownMenu>
      </>} />
    {refreshing
      ? <ManagementLoading variant="projects" label="刷新项目列表" />
      : <>
        <div className="cms-filter-rows">
          <CmsFilterGroup icon={LayoutGrid} label="来源" count={counts.all} ariaLabel="项目分类" value={scope} onChange={id => setScope(id as ProjectScope)} chips={PROJECT_SCOPES.map(s => ({ id: s.id, label: s.label, meta: counts[s.id] }))} />
        </div>
        <div className="cost-results-heading">
          <h2>{SCOPE_TITLE[scope]}<span>{entries.length} 项{more ? ' · 向下滚动加载更多' : ''}</span></h2>
          {filtered
            ? <EditorTooltip label="查看全部"><button type="button" className="cost-clear-filter" onClick={resetFilter}><X size={14} />查看全部</button></EditorTooltip>
            : <span>按修改时间排序</span>}
        </div>
        {scope !== 'builtin' && projects.listError && <LoadError title="云端项目读取失败" message={projects.listError} retrying={projects.loading} onRetry={() => void refresh()} />}
        {scope !== 'builtin' && !searching && projects.loading && !list.length && <div className="cms-loading-placeholder" role="status" aria-label="加载项目" aria-busy="true"><ProjectCardsSkeleton count={4} /></div>}
        {scope !== 'builtin' && !searching && !projects.loading && !projects.listError && !list.length && <div className="cms-empty"><LayoutTemplate size={36} /><h2>还没有设计项目</h2><p>{scope === 'all' ? '新建空白户型，或从下方内置模板开始。' : '新建空白户型，开始规划你的空间。'}</p></div>}
        {searching && !entries.length && !loadingList && <div className="cms-empty"><Search size={30} /><h2>没有匹配的项目</h2><p>{more ? '已加载的项目中没有匹配项，向下滚动会继续加载更多，或换个关键词。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={resetFilter}>清空筛选</Button></div>}
        <div className="cms-project-grid">{shown.items.map(entry => {
          if (entry.kind === 'builtin') {
            const row = projects.builtins.find(r => r.templateId === entry.preset.id);
            if (!row) return null;
            return <ProjectCard key={entry.key} title={entry.preset.name} badge="内置" thumbnail={<PresetThumbnail preset={entry.preset} />}
              busyLabel={busyLabel(row)} locked={createBusy || creation.submitting} openLabel="预览模板" onOpen={() => void rowAction.run('open', row)}
              actions={templateCardActions(() => void rowAction.run('copyTemplate', row))} />;
          }
          const row = entry.row, design = guestStates.get(row.id) ?? row.thumbnail;
          const thumbnail = design ? <PlanThumbnail design={design} label={row.name + ' 平面缩略图'} /> : null;
          return <ProjectCard key={entry.key} title={row.name} badge={row.cloud ? undefined : '本机'} thumbnail={thumbnail}
            busyLabel={busyLabel(row)} locked={rowAction.pending} openLabel="打开项目" onOpen={() => void rowAction.run('open', row)}
            actions={mineCardActions(row, { rename: () => setRename(row), duplicate: () => void rowAction.run('duplicate', row), remove: () => setDeleting(row) })} />;
        })}</div>
        <ProjectLoadMore shown={shown.items.length} total={shown.available} hasMore={more} loading={projects.loading} onReach={() => loadMore(shown.available)} />
      </>}

    {creation.dialogs}

    <ProjectRenameDialog project={rename} onClose={() => setRename(null)} onSubmit={projects.rename} />
    <ProjectDeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={row => rowAction.run('remove', row)} />
  </>;
}
