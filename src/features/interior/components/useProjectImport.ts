import { useState } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { notify } from '@/lib/notify';
import { createProject } from '../data/templates';
import { parseDesignFile } from '../model/designImport';
import type { DxfSource } from '../model/externalDxf/dxfSource';
import type { Design } from '../model/types';
import type { useProjects } from '../cloud/useProjects';

/**
 * 导入图纸的流程状态。
 * 本应用导出的 DXF 自带方案数据，直接建项目；外部 CAD 图纸先放进 drawing，等识别确认弹窗确认后再建。
 */
export function useProjectImport(projects: Pick<ReturnType<typeof useProjects>, 'create'>, opened: () => void) {
  const [drawing, setDrawing] = useState<{ source: DxfSource; name: string } | null>(null);
  const importDesign = async (design: Design, name: string) => {
    const project = { ...createProject(design.template, name), state: design };
    if (!(await projects.create(project, true))) return false;
    notify.success('已导入方案「' + project.name + '」');
    opened();
    return true;
  };
  const file = useAsyncAction(async (selected: File) => {
    try {
      const imported = await parseDesignFile(selected);
      if (imported.kind === 'dxf') setDrawing({ source: imported.source, name: imported.name });
      else await importDesign(imported.design, imported.name);
    } catch (error) {
      notify.fail('导入失败：' + (error instanceof Error ? error.message : '文件无法读取'));
    }
  });
  const confirm = useAsyncAction(async (design: Design, name: string) => {
    if (await importDesign(design, name)) setDrawing(null);
  });
  return {
    /** 等待识别确认的外部图纸；非空时要显示识别确认弹窗。 */
    drawing,
    closeDrawing: () => setDrawing(null),
    reading: file.pending,
    saving: confirm.pending,
    importFile: (selected: File) => void file.run(selected),
    confirmDrawing: (design: Design, name: string) => void confirm.run(design, name),
  };
}
