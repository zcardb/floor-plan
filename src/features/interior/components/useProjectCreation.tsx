import { Suspense, useRef, useState } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject } from '../data/templates';
import { IMPORT_ACCEPT } from '../model/designImport';
import type { Project } from '../model/types';
import { NewProjectDialog, type NewProjectInput } from './NewProjectDialog';
import { AiCreateProjectDialog } from './lazyDialogs';
import { DxfImportDialog } from './DxfImportDialog';
import { useProjectImport } from './useProjectImport';
import type { CreateProjectActions } from './CreateProjectMenuItems';

/**
 * 「新建项目」的全部方式（手动创建、复刻当前项目、AI 创建、导入图纸）共用一套弹窗与流程。
 * 项目管理页与工作台项目下拉都用它，保证两处入口的选项与行为一致。
 * `dialogs` 需渲染在下拉菜单之外，菜单收起后弹窗仍保留。
 */
export function useProjectCreation({ create, opened, ai, duplicate }: {
  create: (project: Project) => Promise<boolean>;
  opened: () => void;
  ai: boolean;
  /** 复刻当前项目；项目管理页没有「当前项目」概念，故只有工作台传入。 */
  duplicate?: () => void;
}) {
  const [creating, setCreating] = useState(false), [aiCreating, setAiCreating] = useState(false),
    // AI 创建弹窗按需下载：第一次打开后才挂载，之后保持挂载以保留关闭动画。
    [aiMounted, setAiMounted] = useState(false);
  const submit = useAsyncAction(async ({ template, name, size, design }: NewProjectInput) => {
    const project = createProject(template, name, size, design);
    if (await create(project)) { setCreating(false); setAiCreating(false); notify.success('已创建项目「' + project.name + '」'); opened(); }
  });
  const file = useRef<HTMLInputElement>(null);
  const imports = useProjectImport({ create }, opened);
  const actions: CreateProjectActions = {
    blank: () => setCreating(true),
    duplicate,
    ai: ai ? () => { setAiMounted(true); setAiCreating(true); } : undefined,
    importFile: () => file.current?.click(),
  };
  return {
    actions,
    submitting: submit.pending,
    reading: imports.reading,
    /** 正在读取或保存导入的图纸。 */
    importing: imports.reading || imports.saving,
    dialogOpen: creating || aiCreating,
    dialogs: <>
      <input ref={file} type="file" accept={IMPORT_ACCEPT} hidden aria-hidden="true" tabIndex={-1} onChange={event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (selected) imports.importFile(selected);
      }} />
      <NewProjectDialog open={creating} pending={submit.pending} onClose={() => setCreating(false)} onSubmit={input => void submit.run(input)} />
      {ai && aiMounted && <Suspense fallback={null}><AiCreateProjectDialog open={aiCreating} pending={submit.pending} onClose={() => setAiCreating(false)} onSubmit={input => void submit.run(input)} /></Suspense>}
      {imports.drawing && <DxfImportDialog source={imports.drawing.source} defaultName={imports.drawing.name} pending={imports.saving}
        onImport={imports.confirmDrawing} onClose={imports.closeDrawing} />}
    </>,
  };
}
