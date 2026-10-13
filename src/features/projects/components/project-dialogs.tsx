import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useAsyncAction } from '@/hooks/use-async-action';
import type { ProjectSummary } from '../hooks/use-projects';

const NAME_LIMIT = 100;

interface RenameProps {
  project: ProjectSummary | null;
  onClose: () => void;
  onSubmit: (project: ProjectSummary, name: string) => Promise<boolean>;
}

/** 重命名：预填并全选原名，未改动或为空时不可提交（Feedforward），成功后自动关闭。 */
export function ProjectRenameDialog({ project, onClose, onSubmit }: RenameProps) {
  const submit = useAsyncAction(async (row: ProjectSummary, name: string) => { if (await onSubmit(row, name)) onClose(); });
  return <Dialog open={!!project} onOpenChange={v => { if (!v && !submit.pending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>重命名项目</DialogTitle><DialogDescription>只修改名称，方案内容保持不变。</DialogDescription></DialogHeader>
      {project && <RenameForm key={project.id} project={project} pending={submit.pending} onSubmit={name => void submit.run(project, name)} />}
    </DialogContent>
  </Dialog>;
}

function RenameForm({ project, pending, onSubmit }: { project: ProjectSummary; pending: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(project.name);
  const trimmed = name.trim(), unchanged = trimmed === project.name;
  return <form className="cms-form" onSubmit={e => { e.preventDefault(); if (trimmed && !unchanged) onSubmit(trimmed); }}>
    <fieldset className="contents" disabled={pending}>
      <div className="cms-field">
        <Label htmlFor="project-rename">项目名称</Label>
        <Input id="project-rename" required autoFocus maxLength={NAME_LIMIT} value={name} onFocus={e => e.currentTarget.select()} onChange={e => setName(e.target.value)} />
        <span className="field-counter">{name.length}/{NAME_LIMIT}</span>
      </div>
    </fieldset>
    <Button loading={pending} disabled={!trimmed || unchanged}>{pending ? '正在保存…' : '保存名称'}</Button>
  </form>;
}

interface DeleteProps {
  project: ProjectSummary | null;
  /** 正在编辑的项目：删除后会离开工作台，需要提前说明。 */
  current?: boolean;
  onClose: () => void;
  onConfirm: (project: ProjectSummary) => Promise<boolean | undefined>;
}

/** 删除确认：默认焦点在「取消」，写清后果与项目名，避免误删（Loss Aversion）。 */
export function ProjectDeleteDialog({ project, current, onClose, onConfirm }: DeleteProps) {
  const remove = useAsyncAction(async (row: ProjectSummary) => { if (await onConfirm(row)) onClose(); });
  return <AlertDialog open={!!project} onOpenChange={v => { if (!v && !remove.pending) onClose(); }}>
    <AlertDialogContent className="confirm-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>删除「{project?.name}」？</AlertDialogTitle>
        <AlertDialogDescription>{current ? '这是你正在编辑的项目，删除后将返回项目管理。' : ''}删除后不可撤销，请先下载需要保留的方案。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={remove.pending}>取消</AlertDialogCancel>
        <Button variant="destructive" disabled={!project || remove.pending} loading={remove.pending} onClick={() => { if (project) void remove.run(project); }}>删除项目</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
