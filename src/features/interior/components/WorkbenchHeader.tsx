import { useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button variant="ghost" size="icon" className="workspace-icon-button" aria-label="返回项目管理" title="返回项目管理" disabled={!!pending} onClick={p.onBack}><ArrowLeft /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="workspace-project-switch" aria-label={'切换项目：' + p.project.name} disabled={!!pending} aria-busy={!!pending}>
            <span>{p.project.name}</span>{pending ? <Loader2 className="animate-spin" /> : <ChevronDown />}
          </Button>
        </DropdownMenuTrigger>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="workspace-icon-button workspace-account-button" aria-label="我的账号" title="我的账号"><AccountAvatar email={p.email} size={32} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="account-menu-head"><AccountAvatar email={p.email} size={34} /><span><b>{p.email}</b><small>已登录 · 云端同步</small></span></DropdownMenuLabel>
          <DropdownMenuSeparator /><DropdownMenuItem onClick={p.onLogout}>退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {p.view === '2d' && p.onExportDrawing ? <DropdownMenu>
        <DropdownMenuTrigger asChild><Button className="workspace-download" aria-label="下载设计图"><Download /><span>下载设计图</span><ChevronDown size={14} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onClick={p.onDownload}><Download />下载 2D 图片（PNG）</DropdownMenuItem><DrawingExportItems onExport={p.onExportDrawing} /></DropdownMenuContent>
      </DropdownMenu> : <Button className="workspace-download" onClick={p.onDownload} aria-label={p.view === '2d' ? '下载设计图' : '下载当前视角'}><Download /><span>下载{p.view === '2d' ? '设计图' : '当前视角'}</span></Button>}
    </div>
  </header>;
}
