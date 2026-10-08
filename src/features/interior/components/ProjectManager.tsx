import { useRef, useState } from 'react';
import { ManagementLoading } from './ManagementLoading';
import { LoadError } from './LoadError';
import { Plus, LayoutTemplate, RefreshCw, Loader2, ChevronDown, FilePlus2, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectRenameDialog, ProjectDeleteDialog } from './ProjectDialogs';
import { ProjectRowActions } from './ProjectRowActions';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject } from '../data/templates';
import { IMPORT_ACCEPT, parseDesignFile } from '../model/designImport';
import type { DxfSource } from '../model/externalDxf/dxfSource';
import type { Design } from '../model/types';
import { DxfImportDialog } from './DxfImportDialog';
import { SoftwareSoonItem } from './SoftwareSoonItem';
import type { useProjects, ProjectSummary } from '../cloud/useProjects';

type Projects = ReturnType<typeof useProjects>;

export function ProjectManager({ projects, opened }: { projects: Projects; opened: () => void }) {
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [template, setTemplate] = useState<'blank' | 'reference'>('blank');
  const [rename, setRename] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const list: ProjectSummary[] = [
    ...projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false, system: g.system === true })),
    ...projects.cloud,
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // 卡片级操作共用一把锁：同一时间只处理一个项目，避免打开/复制/删除互相打架。
  const rowAction = useAsyncAction(
    async (kind: 'open' | 'duplicate' | 'remove', row: ProjectSummary) => {
      if (kind === 'open') { if (await projects.open(row)) opened(); return; }
      if (kind === 'duplicate') { if (await projects.duplicate(row)) opened(); return; }
      return projects.remove(row);
    },
    (kind, row) => kind + ':' + row.id,
  );
  const submit = useAsyncAction(async () => {
    const project = createProject(template, name);
    if (await projects.create(project, true)) { setCreating(false); notify.success('已创建项目「' + project.name + '」'); opened(); }
  });
  const file = useRef<HTMLInputElement>(null);
  // 外部 CAD 图纸先进识别确认弹窗；本应用导出的 DXF 自带方案数据，直接还原。
  const [drawing, setDrawing] = useState<{ source: DxfSource; name: string } | null>(null);
  const importDesign = async (design: Design, importedName: string) => {
    const project = { ...createProject(design.template, importedName), state: design };
    if (!(await projects.create(project, true))) return false;
    notify.success('已导入方案「' + project.name + '」');
    opened();
    return true;
  };
  const importFile = useAsyncAction(async (selected: File) => {
    try {
      const imported = await parseDesignFile(selected);
      if (imported.kind === 'dxf') setDrawing({ source: imported.source, name: imported.name });
      else await importDesign(imported.design, imported.name);
    } catch (error) {
      notify.fail('导入失败：' + (error instanceof Error ? error.message : '文件无法读取'));
    }
  });
  const importDrawing = useAsyncAction(async (design: Design, importedName: string) => {
    if (await importDesign(design, importedName)) setDrawing(null);
  });
  const pickFile = () => file.current?.click();
  const createBusy = rowAction.pending || importFile.pending || importDrawing.pending;
  const busyRow = rowAction.pendingKey?.split(':')[1] ?? null;
  const isPending = (kind: string, row: ProjectSummary) => rowAction.pendingKey === kind + ':' + row.id;
  const refreshing = projects.loading && !rowAction.pending;

  return <>
    <div className="cms-heading">
      <div><h1>项目管理</h1><p>把每个空间的灵感，保存成独立方案。</p></div>
      <div className="cms-heading-actions">
        <Button variant="outline" className="cms-refresh-button" disabled={projects.loading} aria-busy={refreshing} onClick={() => void projects.reload()}><RefreshCw className={refreshing ? 'animate-spin' : ''} />刷新</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="cms-create-button" disabled={createBusy} aria-busy={importFile.pending}>
              {importFile.pending ? <Loader2 className="animate-spin" /> : <Plus />}新建项目<ChevronDown />
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
          if (selected && !importFile.pending) void importFile.run(selected);
        }} />
      </div>
    </div>
    {projects.listError && <LoadError title="云端项目读取失败" message={projects.listError} retrying={projects.loading} onRetry={() => void projects.reload()} />}
    {projects.loading && !list.length && <ManagementLoading label="加载项目" />}
    {!projects.loading && !projects.listError && !list.length && <div className="cms-empty"><LayoutTemplate size={36} /><h2>还没有设计项目</h2><p>新建空白户型，开始规划你的空间。</p></div>}
    <div className="cms-project-grid">{list.map(row => {
      const working = busyRow === row.id;
      return <article className={'cms-card' + (working ? ' is-busy' : '')} key={row.id} aria-busy={working}>
        <EditorTooltip label={row.name} disabled={rowAction.pending}>
          <button type="button" className="cms-card-open" aria-label={'打开项目 ' + row.name} disabled={rowAction.pending} onClick={() => void rowAction.run('open', row)} />
        </EditorTooltip>
        {working ? <Loader2 className="animate-spin" size={30} /> : <LayoutTemplate size={30} />}
        <h2>{row.name}</h2>
        <p>{isPending('remove', row) ? '正在删除…' : isPending('duplicate', row) ? '正在复制…' : new Date(row.updatedAt).toLocaleDateString('zh-CN')}</p>
        <div className="cms-card-actions">
          <ProjectRowActions row={row} disabled={rowAction.pending} onRename={() => setRename(row)} onDelete={() => setDeleting(row)}
            onDuplicate={() => void rowAction.run('duplicate', row)} duplicating={isPending('duplicate', row)} />
        </div>
      </article>;
    })}</div>
    {projects.hasMore && <div className="project-list-footer"><Button variant="ghost" loading={projects.loading && !!list.length} disabled={projects.loading} onClick={() => void projects.loadMore()}>加载更多</Button></div>}

    <Dialog open={creating} onOpenChange={v => { if (!v && !submit.pending) setCreating(false); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader>
        <form className="cms-form" onSubmit={e => { e.preventDefault(); void submit.run(); }}>
          <fieldset className="contents" disabled={submit.pending}>
            <div className="cms-field"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="cms-field"><Label htmlFor="project-template">户型模板</Label><Select value={template} onValueChange={v => setTemplate(v as typeof template)} disabled={submit.pending}><SelectTrigger id="project-template"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">空白户型</SelectItem><SelectItem value="reference">参考户型</SelectItem></SelectContent></Select></div>
          </fieldset>
          <Button loading={submit.pending} disabled={!name.trim()}>{submit.pending ? '正在保存…' : '确认保存'}</Button>
        </form>
      </DialogContent>
    </Dialog>

    <ProjectRenameDialog project={rename} onClose={() => setRename(null)} onSubmit={projects.rename} />
    <ProjectDeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={row => rowAction.run('remove', row)} />
  </>;
}
