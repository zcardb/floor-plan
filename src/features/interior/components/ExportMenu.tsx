import { ChevronDown, ClipboardList, CloudUpload, FileCode2, FileJson, FilePenLine, FileText, Image, Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SoftwareSoonItem } from './SoftwareSoonItem';
import type { DrawingFormat } from '../model/drawingExport';
import type { SaveStatus } from '../cloud/useProjects';

export type ExportFormat = 'png' | DrawingFormat | 'json';

/** 保存按钮上的状态标记：无 / 小圆点（待保存）/ 红点（失败、冲突）/ 转圈（保存或导出中）。 */
export type SaveMark = 'none' | 'dirty' | 'error' | 'busy';

interface Props {
  view: '2d' | '3d';
  /** 导出进行中。 */
  pending: boolean;
  onExport: (format: ExportFormat) => void;
  /** 打开方案报告预览（预览里再下载 PDF）。 */
  onReport: () => void;
  status: SaveStatus;
  loggedIn: boolean;
  /** 内置模板只读预览。 */
  readOnly?: boolean;
  /** 游客改过模版（还没登录保存）。 */
  guestDirty?: boolean;
  /** 立即保存 / 登录并保存（现有 cloudSave）。 */
  onSave: () => void;
  saving?: boolean;
}

/** 按钮标记与下拉首行文案都从现有的保存状态推出来，不另存状态。 */
type SaveStateInput = Pick<Props, 'status' | 'loggedIn'> & Partial<Pick<Props, 'readOnly' | 'guestDirty' | 'saving' | 'pending'>>;
export function saveState({ status, loggedIn, readOnly, guestDirty, saving, pending }: SaveStateInput) {
  if (readOnly) return { mark: (pending ? 'busy' : 'none') as SaveMark, label: '内置模板 · 只读', action: null };
  if (!loggedIn) return guestDirty
    ? { mark: (saving || pending ? 'busy' : 'dirty') as SaveMark, label: '登录后保存到云端', action: '登录并保存' }
    : { mark: (pending ? 'busy' : 'none') as SaveMark, label: '本机已保存', action: null };
  const problem = status.kind === 'error' || status.kind === 'conflict';
  const mark: SaveMark = saving || pending || status.kind === 'saving' ? 'busy' : problem ? 'error' : status.kind === 'dirty' ? 'dirty' : 'none';
  return { mark, label: status.label, action: status.kind === 'dirty' || status.kind === 'error' ? '立即保存' : null, problem };
}

/**
 * 顶栏右侧「保存」按钮：文案固定「保存」，状态只用按钮上的小标记和下拉第一行表达；
 * 登录后是主按钮；游客时右侧另有主按钮「登录」，这里降为副按钮（`.save-button.is-secondary`）。
 * 下拉其余部分是导出：「按格式导出」5 项 + 分隔线 +「生成方案报告」「导出到其他软件」。
 */
export function ExportMenu(p: Props) {
  const state = saveState(p);
  const formats = [
    { id: 'png', icon: Image, label: p.view === '2d' ? 'PNG 平面图' : 'PNG 当前视角' },
    { id: 'pdf', icon: FileText, label: 'PDF 矢量图' },
    { id: 'svg', icon: FileCode2, label: 'SVG 矢量图' },
    { id: 'dxf', icon: FilePenLine, label: 'DXF CAD 图纸' },
    { id: 'json', icon: FileJson, label: 'JSON 方案文件' },
  ] as const;
  return <DropdownMenu>
    <EditorTooltip label="保存与导出">
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={p.loggedIn ? 'default' : 'secondary'} className={'save-button' + (p.loggedIn ? '' : ' is-secondary')} aria-label="保存与导出" aria-busy={state.mark === 'busy'}>
          {state.mark === 'busy' ? <Loader2 className="animate-spin" /> : state.mark !== 'none' && <i className="save-button-mark" data-tone={state.mark} aria-hidden="true" />}
          <span>保存</span>
          <ChevronDown className="save-button-caret" />
        </Button>
      </DropdownMenuTrigger>
    </EditorTooltip>
    <DropdownMenuContent align="end" className="toolbar-menu export-menu">
      <div className={'save-menu-status' + ('problem' in state && state.problem ? ' is-error' : '')} role="status">
        <i className="save-button-mark" data-tone={state.mark === 'none' ? 'ok' : state.mark} aria-hidden="true" />
        {state.label}
      </div>
      {state.action && (
        <DropdownMenuItem className="save-menu-action" disabled={p.saving} onSelect={p.onSave}>
          {p.saving ? <Loader2 className="animate-spin" /> : p.loggedIn ? <CloudUpload /> : <LogIn />}
          {state.action}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {/* 导出部分保持一级菜单：分组标题与项目下拉的标题同一样式，格式直接列出，分隔线下为其他软件入口。 */}
      <p className="project-menu-heading">按格式导出</p>
      {formats.map(format => (
        <DropdownMenuItem key={format.id} disabled={p.pending} onSelect={() => p.onExport(format.id)}>
          <format.icon />{format.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={p.pending} onSelect={p.onReport}>
        <ClipboardList />生成方案报告
      </DropdownMenuItem>
      <SoftwareSoonItem label="导出到其他软件" />
    </DropdownMenuContent>
  </DropdownMenu>;
}
