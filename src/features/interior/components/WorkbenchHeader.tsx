import { useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountAvatar } from './AccountAvatar';
import { DrawingExportItems } from './DrawingExportItems';
import type { DrawingFormat } from '../model/drawingExport';
import type { ProjectSummary } from '../cloud/useProjects';

export interface WorkbenchHeaderProps {
  project: ProjectSummary;
  projectList: ProjectSummary[];
  hasMore: boolean;
  listLoading: boolean;
  email?: string;
  view: '2d' | '3d';
  onBack: () => void;
  onOpen: (project: ProjectSummary) => Promise<boolean>;
  onLoadMore: () => void;
  onLogout: () => void;
  loggingOut?: boolean;
  onDownload: () => void;
  onExportDrawing?: (format: DrawingFormat) => void;
}

export function WorkbenchHeader(p: WorkbenchHeaderProps) {
  const [pending, setPending] = useState<string | null>(null);
  const opening = useRef(false);
  const open = async (row: ProjectSummary) => {
    if (opening.current || row.id === p.project.id) return;
    opening.current = true;
    setPending(row.id);
    try { await p.onOpen(row); }
    finally { opening.current = false; setPending(null); }
  };
  return <header className="main-header workspace-header">
    <div className="workspace-navigation">
      <EditorTooltip label="返回项目管理" description="回到项目列表">
        <Button variant="ghost" size="icon" className="workspace-icon-button" aria-label="返回项目管理" disabled={!!pending} onClick={p.onBack}><ArrowLeft /></Button>
      </EditorTooltip>
      <DropdownMenu>
        <EditorTooltip label="切换项目" description="在已保存的多个方案之间切换">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="workspace-project-switch" aria-label={'切换项目：' + p.project.name} disabled={!!pending} aria-busy={!!pending}>
              <span>{p.project.name}</span>{pending ? <Loader2 className="animate-spin" /> : <ChevronDown />}
            </Button>
          </DropdownMenuTrigger>
        </EditorTooltip>
        <DropdownMenuContent align="start" className="workspace-project-menu">
          <DropdownMenuLabel>切换项目</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {p.projectList.map(row => <DropdownMenuItem key={row.id} disabled={!!pending} onSelect={() => void open(row)} className="workspace-project-option">
            <span>{row.name}</span>{row.id === p.project.id && <Check size={16} aria-label="当前项目" />}
          </DropdownMenuItem>)}
          {p.hasMore && <><DropdownMenuSeparator /><DropdownMenuItem disabled={p.listLoading} onSelect={e => { e.preventDefault(); p.onLoadMore(); }}>{p.listLoading && <Loader2 className="animate-spin" />}加载更多项目</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="workspace-header-actions">
      {p.view === '2d' && p.onExportDrawing ? <DropdownMenu>
        <EditorTooltip label="下载设计图" description="导出 2D 图片，或下载 CAD / SVG 工程图">
          <DropdownMenuTrigger asChild><Button className="workspace-download" aria-label="下载设计图"><Download /><span>下载设计图</span><ChevronDown size={14} /></Button></DropdownMenuTrigger>
        </EditorTooltip>
        <DropdownMenuContent align="end"><DropdownMenuItem onClick={p.onDownload}><Download />下载 2D 图片（PNG）</DropdownMenuItem><DrawingExportItems onExport={p.onExportDrawing} /></DropdownMenuContent>
      </DropdownMenu> : <EditorTooltip label={p.view === '2d' ? '下载设计图' : '下载当前视角'} description="把当前画面导出为 PNG 图片">
        <Button className="workspace-download" onClick={p.onDownload} aria-label={p.view === '2d' ? '下载设计图' : '下载当前视角'}><Download /><span>下载{p.view === '2d' ? '设计图' : '当前视角'}</span></Button>
      </EditorTooltip>}
      <span className="toolbar-divider" aria-hidden="true" />
      <DropdownMenu>
        <EditorTooltip label="我的账号" description="查看登录状态与退出登录">
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="workspace-icon-button workspace-account-button" aria-label="我的账号"><AccountAvatar email={p.email} size={28} /></Button></DropdownMenuTrigger>
        </EditorTooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="account-menu-head"><AccountAvatar email={p.email} size={34} /><span><b>{p.email}</b><small>已登录 · 云端同步</small></span></DropdownMenuLabel>
          <DropdownMenuSeparator /><DropdownMenuItem disabled={p.loggingOut} onClick={p.onLogout}>{p.loggingOut && <Loader2 className="animate-spin" />}退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
