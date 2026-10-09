import { useRef, useState } from 'react';
import { ManagementLoading } from './ManagementLoading';
import { LoadError } from './LoadError';
import { Plus, LayoutTemplate, LayoutGrid, RefreshCw, Loader2, ChevronDown, FilePlus2, FileUp, Search, X } from 'lucide-react';
import { CmsPageHeader } from './CmsPageHeader';
import { CmsSearchField } from './CmsSearchField';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectRenameDialog, ProjectDeleteDialog } from './ProjectDialogs';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject, TEMPLATE_PRESETS } from '../data/templates';
import { ProjectCard } from './ProjectCard';
import { PlanThumbnail, PresetThumbnail } from './PlanThumbnail';
import { mineCardActions, templateCardActions } from './projectCardActions';
import { CmsFilterBar } from './CmsFilterBar';
import { ProjectPagination } from './ProjectPagination';
import { filterProjects, paginate, PROJECT_SCOPES, type ProjectScope } from '../model/projectFilter';
import { IMPORT_ACCEPT } from '../model/designImport';
import { DxfImportDialog } from './DxfImportDialog';
import { useProjectImport } from './useProjectImport';
import { SoftwareSoonItem } from './SoftwareSoonItem';
import type { useProjects, ProjectSummary } from '../cloud/useProjects';

type Projects = ReturnType<typeof useProjects>;
const PAGE_SIZE = 12;
const SCOPE_TITLE: Record<ProjectScope, string> = { all: '全部项目', builtin: '内置模板', mine: '我的项目' };
type RowKind = 'open' | 'duplicate' | 'remove' | 'copyTemplate';
const BUSY_LABEL: Record<RowKind, string> = { open: '正在打开…', duplicate: '正在复制…', remove: '正在删除…', copyTemplate: '正在复制…' };

export function ProjectManager({ projects, opened }: { projects: Projects; opened: () => void }) {
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [template, setTemplate] = useState<string>('blank');
  const [rename, setRename] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [scope, setScopeState] = useState<ProjectScope>('all'), [query, setQueryState] = useState(''), [page, setPage] = useState(1);
  const setScope = (next: ProjectScope) => { setScopeState(next); setPage(1); };
  const setQuery = (next: string) => { setQueryState(next); setPage(1); };
  const resetFilter = () => { setScopeState('all'); setQueryState(''); setPage(1); };
  const list: ProjectSummary[] = [
    ...projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false, system: g.system === true })),
    ...projects.cloud,
  ];
  const entries = filterProjects(TEMPLATE_PRESETS, list, scope, query);
  const paged = paginate(entries, page, PAGE_SIZE);
  // 云端还有未加载的项目时，数量只代表已加载部分，用「N+」提示。
  const more = projects.hasMore && scope !== 'builtin';
  const counts: Record<ProjectScope, string> = {
    all: TEMPLATE_PRESETS.length + list.length + (projects.hasMore ? '+' : ''),
    builtin: String(TEMPLATE_PRESETS.length),
    mine: list.length + (projects.hasMore ? '+' : ''),
  };
  const searching = query.trim() !== '';
  const filtered = searching || scope !== 'all';

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
  const submit = useAsyncAction(async () => {
    const project = createProject(template, name);
    if (await projects.create(project, true)) { setCreating(false); notify.success('已创建项目「' + project.name + '」'); opened(); }
  });
  const file = useRef<HTMLInputElement>(null);
  const imports = useProjectImport(projects, opened);
  const pickFile = () => file.current?.click();
  const createBusy = rowAction.pending || imports.reading || imports.saving;
  const busyLabel = (row: ProjectSummary) => {
    const [kind, id] = rowAction.pendingKey?.split(/:(.*)/) ?? [];
    return id === row.id ? BUSY_LABEL[kind as RowKind] : undefined;
  };
  const guestStates = new Map(projects.guests.map(g => [g.id, g.state]));
  const refreshing = projects.loading && !rowAction.pending;

  return <>
    <CmsPageHeader eyebrow="设计工作台" title="项目管理" description="把每个空间的灵感，保存成独立方案。" actions={<>
        <EditorTooltip label="刷新" disabled={projects.loading}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={projects.loading} aria-busy={refreshing} onClick={() => void projects.reload()}><RefreshCw className={refreshing ? 'animate-spin' : ''} /></Button>
        </EditorTooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="cms-create-button" disabled={createBusy} aria-busy={imports.reading}>
              {imports.reading ? <Loader2 className="animate-spin" /> : <Plus />}新建项目<ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="create-menu">
            <DropdownMenuItem onSelect={() => { setName(''); setCreating(true); }}><FilePlus2 />新建项目</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={pickFile}><FileUp />导入 DXF 图纸…</DropdownMenuItem>
            <SoftwareSoonItem label="从其他软件导入" />
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={file} type="file" accept={IMPORT_ACCEPT} hidden aria-hidden="true" tabIndex={-1} onChange={event => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          if (selected) imports.importFile(selected);
        }} />
      </>} />
    <div className="cost-controls project-filter-panel">
      <div className="cost-toolbar">
        <CmsSearchField label="搜索项目" placeholder="搜索项目名称、户型…" value={query} onChange={setQuery} loading={projects.loading} loadingLabel="加载项目" matchCount={entries.length} />
      </div>
      <div className="cost-group project-scope-group">
        <div className="cost-group-label"><LayoutGrid size={15} /><span>来源</span><small>{counts.all} 项</small></div>
        <CmsFilterBar label="项目分类" value={scope} onChange={id => setScope(id as ProjectScope)} chips={PROJECT_SCOPES.map(s => ({ id: s.id, label: s.label, meta: counts[s.id] }))} />
      </div>
    </div>
    <div className="cost-results-heading">
      <h2>{SCOPE_TITLE[scope]}<span>{entries.length} 项{paged.pages > 1 ? ` · 第 ${paged.page} / ${paged.pages} 页` : ''}</span></h2>
      {filtered
        ? <EditorTooltip label="查看全部"><button type="button" className="cost-clear-filter" onClick={resetFilter}><X size={14} />查看全部</button></EditorTooltip>
        : <span>按修改时间排序</span>}
    </div>
    {scope !== 'builtin' && projects.listError && <LoadError title="云端项目读取失败" message={projects.listError} retrying={projects.loading} onRetry={() => void projects.reload()} />}
    {scope !== 'builtin' && !searching && projects.loading && !list.length && <ManagementLoading label="加载项目" />}
    {scope !== 'builtin' && !searching && !projects.loading && !projects.listError && !list.length && <div className="cms-empty"><LayoutTemplate size={36} /><h2>还没有设计项目</h2><p>{scope === 'all' ? '新建空白户型，或从下方内置模板开始。' : '新建空白户型，开始规划你的空间。'}</p></div>}
    {searching && !entries.length && !projects.loading && <div className="cms-empty"><Search size={30} /><h2>没有匹配的项目</h2><p>{more ? '已加载的项目中没有匹配项，可翻到下一页加载更多，或换个关键词。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={resetFilter}>清空筛选</Button></div>}
    <div className="cms-project-grid">{paged.items.map(entry => {
      if (entry.kind === 'builtin') {
        const row = projects.builtins.find(r => r.templateId === entry.preset.id);
        if (!row) return null;
        return <ProjectCard key={entry.key} title={entry.preset.name} badge="内置" thumbnail={<PresetThumbnail preset={entry.preset} />}
          busyLabel={busyLabel(row)} locked={createBusy || submit.pending} openLabel="预览模板" onOpen={() => void rowAction.run('open', row)}
          actions={templateCardActions(() => void rowAction.run('copyTemplate', row))} />;
      }
      const row = entry.row, design = guestStates.get(row.id) ?? row.thumbnail;
      const thumbnail = design ? <PlanThumbnail design={design} label={row.name + ' 平面缩略图'} /> : null;
      return <ProjectCard key={entry.key} title={row.name} badge={row.cloud ? undefined : '本机'} thumbnail={thumbnail}
        busyLabel={busyLabel(row)} locked={rowAction.pending} openLabel="打开项目" onOpen={() => void rowAction.run('open', row)}
        actions={mineCardActions(row, { rename: () => setRename(row), duplicate: () => void rowAction.run('duplicate', row), remove: () => setDeleting(row) })} />;
    })}</div>
    <ProjectPagination page={paged.page} pages={paged.pages} hasMore={more} loading={projects.loading} onPage={setPage} onLoadMore={projects.loadMore} />

    <Dialog open={creating} onOpenChange={v => { if (!v && !submit.pending) setCreating(false); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader>
        <form className="cms-form" onSubmit={e => { e.preventDefault(); void submit.run(); }}>
          <fieldset className="contents" disabled={submit.pending}>
            <div className="cms-field"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="cms-field"><Label htmlFor="project-template">户型模板</Label><Select value={template} onValueChange={v => setTemplate(v as typeof template)} disabled={submit.pending}><SelectTrigger id="project-template"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">空白户型</SelectItem>{TEMPLATE_PRESETS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          </fieldset>
          <Button loading={submit.pending} disabled={!name.trim()}>{submit.pending ? '正在保存…' : '确认保存'}</Button>
        </form>
      </DialogContent>
    </Dialog>

    {imports.drawing && <DxfImportDialog source={imports.drawing.source} defaultName={imports.drawing.name} pending={imports.saving}
      onImport={imports.confirmDrawing} onClose={imports.closeDrawing} />}

    <ProjectRenameDialog project={rename} onClose={() => setRename(null)} onSubmit={projects.rename} />
    <ProjectDeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={row => rowAction.run('remove', row)} />
  </>;
}
