import { useState } from 'react';
import { ManagementLoading } from './ManagementLoading';
import { LoadError } from './LoadError';
import { Plus, Pencil, Copy, Trash2, LayoutTemplate, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject } from '../data/templates';
import type { useProjects, ProjectSummary } from '../cloud/useProjects';

const iconAction = 'h-8 w-8 text-muted-foreground hover:text-foreground';
type Projects = ReturnType<typeof useProjects>;

export function ProjectManager({ projects, opened }: { projects: Projects; opened: () => void }) {
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [template, setTemplate] = useState<'blank' | 'reference'>('blank');
  const [rename, setRename] = useState<ProjectSummary | null>(null), [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const list: ProjectSummary[] = [
    ...projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false })),
    ...projects.cloud,
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // 卡片级操作共用一把锁：同一时间只处理一个项目，避免打开/复制/删除互相打架。
  const rowAction = useAsyncAction(
    async (kind: 'open' | 'duplicate' | 'remove', row: ProjectSummary) => {
      if (kind === 'open') { if (await projects.open(row)) opened(); return; }
      if (kind === 'duplicate') { if (await projects.duplicate(row)) opened(); return; }
      if (await projects.remove(row)) setDeleting(null);
    },
    (kind, row) => kind + ':' + row.id,
  );
  const submit = useAsyncAction(async () => {
    if (rename) { if (await projects.rename(rename, name)) setRename(null); return; }
    const project = createProject(template, name);
    if (await projects.create(project, true)) { setCreating(false); notify.success('已创建项目「' + project.name + '」'); opened(); }
  });
  const busyRow = rowAction.pendingKey?.split(':')[1] ?? null;
  const isPending = (kind: string, row: ProjectSummary) => rowAction.pendingKey === kind + ':' + row.id;
  const refreshing = projects.loading && !rowAction.pending;

  const rowActions = (row: ProjectSummary) => <>
    <EditorTooltip label="重命名项目" description={`修改「${row.name}」的名称`} disabled={rowAction.pending}>
      <Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'重命名' + row.name} disabled={rowAction.pending} onClick={() => { setRename(row); setName(row.name); }}><Pencil size={16} /></Button>
    </EditorTooltip>
    {row.cloud && <EditorTooltip label="复制项目" description={`用「${row.name}」的当前内容再建一个方案`} disabled={rowAction.pending}><Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'复制' + row.name} disabled={rowAction.pending} aria-busy={isPending('duplicate', row)} onClick={() => void rowAction.run('duplicate', row)}>{isPending('duplicate', row) ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />}</Button></EditorTooltip>}
    <EditorTooltip label="删除项目" description={`永久删除「${row.name}」，不可撤销`} disabled={rowAction.pending}>
      <Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'删除' + row.name} disabled={rowAction.pending} onClick={() => setDeleting(row)}><Trash2 size={16} /></Button>
    </EditorTooltip>
  </>;

  return <>
    <div className="cms-heading">
      <div><h1>项目管理</h1><p>把每个空间的灵感，保存成独立方案。</p></div>
      <div className="cms-heading-actions">
        <EditorTooltip label="刷新项目" description="重新从云端拉取项目列表" disabled={projects.loading}>
          <Button variant="ghost" size="icon" className="cms-refresh-button" aria-label="刷新项目" disabled={projects.loading} aria-busy={refreshing} onClick={() => void projects.reload()}><RefreshCw className={refreshing ? 'animate-spin' : ''} /></Button>
        </EditorTooltip>
        <EditorTooltip label="新建项目" description="选择户型模板，创建一个新方案" disabled={rowAction.pending}>
          <Button className="cms-create-button" disabled={rowAction.pending} onClick={() => { setName(''); setCreating(true); }}><Plus />新建项目</Button>
        </EditorTooltip>
      </div>
    </div>
    {projects.listError && <LoadError title="云端项目读取失败" message={projects.listError} retrying={projects.loading} onRetry={() => void projects.reload()} />}
    {projects.loading && !list.length && <ManagementLoading label="加载项目" />}
    {!projects.loading && !projects.listError && !list.length && <div className="cms-empty"><LayoutTemplate size={36} /><h2>还没有设计项目</h2><p>新建空白户型，开始规划你的空间。</p></div>}
    <div className="cms-project-grid">{list.map(row => {
      const working = busyRow === row.id;
      return <article className={'cms-card' + (working ? ' is-busy' : '')} key={row.id} aria-busy={working}>
        <EditorTooltip label={`打开 ${row.name}`} description="打开这个方案继续编辑" disabled={rowAction.pending}>
          <button type="button" className="cms-card-open" aria-label={'打开项目 ' + row.name} disabled={rowAction.pending} onClick={() => void rowAction.run('open', row)} />
        </EditorTooltip>
        {working ? <Loader2 className="animate-spin" size={30} /> : <LayoutTemplate size={30} />}
        <h2>{row.name}</h2>
        <p>{isPending('remove', row) ? '正在删除…' : isPending('duplicate', row) ? '正在复制…' : new Date(row.updatedAt).toLocaleDateString('zh-CN')}</p>
        <div className="cms-card-actions">{rowActions(row)}</div>
      </article>;
    })}</div>
    {projects.hasMore && <div className="project-list-footer"><EditorTooltip label="加载更多" description="继续加载下一批项目"><Button variant="ghost" loading={projects.loading && !!list.length} disabled={projects.loading} onClick={() => void projects.loadMore()}>加载更多</Button></EditorTooltip></div>}

    <Dialog open={creating || !!rename} onOpenChange={v => { if (!v && !submit.pending) { setCreating(false); setRename(null); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{rename ? '重命名项目' : '新建项目'}</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader>
        <form className="cms-form" onSubmit={e => { e.preventDefault(); void submit.run(); }}>
          <fieldset className="contents" disabled={submit.pending}>
            <div className="cms-field"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
            {!rename && <div className="cms-field"><Label htmlFor="project-template">户型模板</Label><Select value={template} onValueChange={v => setTemplate(v as typeof template)} disabled={submit.pending}><SelectTrigger id="project-template"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">空白户型</SelectItem><SelectItem value="reference">参考户型</SelectItem></SelectContent></Select></div>}
          </fieldset>
          <EditorTooltip label="确认保存" description={rename ? '应用新的项目名称' : '按选择的模板创建项目'} disabled={submit.pending || !name.trim()}>
            <Button loading={submit.pending} disabled={!name.trim()}>{submit.pending ? '正在保存…' : '确认保存'}</Button>
          </EditorTooltip>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleting} onOpenChange={v => { if (!v && !rowAction.pending) setDeleting(null); }}>
      <AlertDialogContent className="confirm-dialog">
        <AlertDialogHeader><AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>不可撤销。请先下载需要保留的方案。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={rowAction.pending}>取消</AlertDialogCancel>
          <EditorTooltip label="删除项目" description="立即永久删除这个项目，不可恢复" disabled={!deleting || rowAction.pending} side="top">
            <Button variant="destructive" loading={!!deleting && isPending('remove', deleting)} onClick={() => { if (deleting) void rowAction.run('remove', deleting); }}>删除项目</Button>
          </EditorTooltip>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
