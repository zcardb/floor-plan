import { useEffect, useRef, useState } from 'react';
import { ManagementLoading } from '@/components/cms/management-loading';
import { LoadError } from '@/components/cms/load-error';
import { Plus, LayoutTemplate, RefreshCw, Loader2, ChevronDown, Search } from 'lucide-react';
import { CmsPageHeader } from '@/components/cms/cms-page-header';
import { CmsSearchField } from '@/components/cms/cms-search-field';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectRenameDialog, ProjectDeleteDialog } from './project-dialogs';
import { CreateProjectMenuItems } from './create-project-menu-items';
import { useProjectCreation } from '../hooks/use-project-creation';
import { useAsyncAction } from '@/hooks/use-async-action';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { notify } from '@/lib/notify';
import { trackProjectCreated } from '@/lib/analytics/events';
import type { PageRequest, PageResult } from '@/lib/paging';
import { createProject, TEMPLATE_PRESETS } from '@/lib/floor-plan/templates';
import { ProjectCard } from './project-card';
import { PlanThumbnail, PresetThumbnail } from '@/components/plan-thumbnail/plan-thumbnail';
import { mineCardActions, templateCardActions } from '../model/project-card-actions';
import { CmsFilterGroup } from '@/components/cms/cms-filter-group';
import { ListLoadMore } from '@/components/list-load-more/list-load-more';
import { localProjectEntries, mineEntry, projectScopeCounts, PROJECT_SCOPES, type ProjectEntry, type ProjectScope } from '../model/project-filter';
import { backfillThumbnails, projectPage } from '../api/project-pages';
import type { useProjects, ProjectSummary } from '../hooks/use-projects';

type Projects = ReturnType<typeof useProjects>;
type RowKind = 'open' | 'duplicate' | 'remove' | 'copyTemplate';
type ScopeCount = 'mine' | 'builtin';
const BUSY_LABEL: Record<RowKind, string> = { open: '正在打开…', duplicate: '正在复制…', remove: '正在删除…', copyTemplate: '正在复制…' };

/**
 * 列表的接口部分：我的云端项目（按修改时间倒序，名称搜索在接口里做）。
 * 只看内置模板时列表里没有云端项目，但分类胶囊上的数量仍要显示，所以只向接口取数量。
 */
const cloudProjects = (scope: ProjectScope, query: string) => async (request: PageRequest): Promise<PageResult<ProjectEntry, ScopeCount>> => {
  if (scope === 'builtin') {
    const { counts } = await projectPage({ page: 1, pageSize: 0 });
    return { list: [], pagination: { ...request, total: 0 }, counts };
  }
  const page = await projectPage(request, { query });
  return { ...page, list: page.list.map(mineEntry) };
};

/**
 * 管理端「项目管理」：云端项目（接口分页）在前，本机方案与内置模板在后，统一分页一页 20 个。
 */
export function ProjectManager({ projects, opened }: { projects: Projects; opened: () => void }) {
  const [rename, setRename] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [scope, setScope] = useState<ProjectScope>('all'), [query, setQuery] = useState('');
  // 真正用来筛选的搜索词：停止输入片刻后才生效，接口、本机方案与内置模板用同一个词，结果一起出现。
  const search = useDebouncedValue(query.trim());
  const guests: ProjectSummary[] = projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false, system: g.system === true }));
  const list = usePagedList<ProjectEntry, ScopeCount>({
    remote: cloudProjects(scope, search),
    local: localProjectEntries(TEMPLATE_PRESETS, guests, scope, search),
    localCounts: { mine: guests.length, builtin: TEMPLATE_PRESETS.length },
    key: scope + '|' + search,
  });
  const counts = projectScopeCounts(list.counts);
  const searching = search !== '';
  const resetFilter = () => { setScope('all'); setQuery(''); };
  const refreshList = list.refresh;

  // 旧版本写入的云端项目没有缩略图：补算后静默刷新一次，每个项目只尝试一次。
  const backfilled = useRef(new Set<string>());
  const missing = list.list.flatMap(entry => (entry.kind === 'mine' && entry.row.cloud && !entry.row.thumbnail && !backfilled.current.has(entry.row.id) ? [entry.row] : []));
  const missingRef = useRef(missing);
  missingRef.current = missing;
  const missingKey = missing.map(row => row.id).join(',');
  useEffect(() => {
    const rows = missingRef.current;
    if (!rows.length) return;
    rows.forEach(row => backfilled.current.add(row.id));
    void backfillThumbnails(rows).then(done => { if (done) void refreshList(); });
  }, [missingKey, refreshList]);

  // 卡片级操作共用一把锁：同一时间只处理一个项目，避免打开/复制/删除互相打架。
  const rowAction = useAsyncAction(
    async (kind: RowKind, row: ProjectSummary) => {
      if (kind === 'open') { if (await projects.open(row)) opened(); return; }
      if (kind === 'duplicate') { if (await projects.duplicate(row)) opened(); return; }
      if (kind === 'copyTemplate') {
        // 「用模板新建」即复制：直接生成一份可编辑的云端副本并打开，和复制我的项目同一流程。
        const name = row.name + ' · 副本';
        if (await projects.create(createProject(row.templateId, name), true)) {
          // 从模板新建也是一次项目创建，用 template 属性区分来源。
          trackProjectCreated({ method: 'manual', template: row.templateId ?? 'blank' });
          notify.success('已复制为「' + name + '」');
          opened();
        }
        return;
      }
      const removed = await projects.remove(row);
      if (removed) void refreshList();
      return removed;
    },
    (kind, row) => kind + ':' + row.id,
  );
  const renameProject = async (row: ProjectSummary, name: string) => {
    const renamed = await projects.rename(row, name);
    if (renamed) void refreshList();
    return renamed;
  };
  const creation = useProjectCreation({ create: project => projects.create(project, true), opened, ai: !!projects.session });
  const createBusy = rowAction.pending || creation.importing;
  const busyLabel = (row: ProjectSummary) => {
    const [kind, id] = rowAction.pendingKey?.split(/:(.*)/) ?? [];
    return id === row.id ? BUSY_LABEL[kind as RowKind] : undefined;
  };
  const guestStates = new Map(projects.guests.map(g => [g.id, g.state]));
  // 首次进入或点了刷新：整片换成骨架屏；切换筛选时保留上一份内容，只有搜索框转圈。
  const firstLoad = list.loading && !list.list.length;

  return <>
    <CmsPageHeader title="项目管理" description="把每个空间的灵感，保存成独立方案。"
      search={<CmsSearchField label="搜索项目" placeholder="搜索项目名称、户型…" value={query} onChange={setQuery} loading={list.loading} loadingLabel="加载项目" matchCount={list.pagination.total} />}
      actions={<>
        <EditorTooltip label="刷新" disabled={list.loading}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={list.loading} aria-busy={list.loading} onClick={list.reload}><RefreshCw className={list.loading ? 'animate-spin' : ''} /></Button>
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
    {firstLoad
      ? <ManagementLoading variant="projects" label="加载项目" />
      : <>
        <div className="cms-filter-rows">
          <CmsFilterGroup ariaLabel="项目分类" value={scope} onChange={id => setScope(id as ProjectScope)} chips={PROJECT_SCOPES.map(s => ({ id: s.id, label: s.label, meta: String(counts[s.id]) }))} />
        </div>
        {list.error && <LoadError title="云端项目读取失败" message={list.error} retrying={list.loading} onRetry={list.reload} />}
        {scope !== 'builtin' && !searching && !list.loading && !list.error && !counts.mine && <div className="cms-empty"><LayoutTemplate size={36} /><h2>还没有设计项目</h2><p>{scope === 'all' ? '新建空白户型，或从下方内置模板开始。' : '新建空白户型，开始规划你的空间。'}</p></div>}
        {searching && !list.loading && !list.list.length && <div className="cms-empty"><Search size={30} /><h2>没有匹配的项目</h2><p>换个分类，或清空搜索再试。</p><Button variant="outline" onClick={resetFilter}>清空筛选</Button></div>}
        <div className="cms-project-grid">{list.list.map(entry => {
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
        <ListLoadMore list={list} />
      </>}

    {creation.dialogs}

    <ProjectRenameDialog project={rename} onClose={() => setRename(null)} onSubmit={renameProject} />
    <ProjectDeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={row => rowAction.run('remove', row)} />
  </>;
}
