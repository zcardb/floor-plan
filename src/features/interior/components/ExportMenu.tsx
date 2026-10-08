import { AppWindow, ChevronDown, Download, FileCode2, FileJson, FilePenLine, FileText, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SoftwareSoonItems } from './SoftwareSoonItems';
import type { DrawingFormat } from '../model/drawingExport';

export type ExportFormat = 'png' | DrawingFormat | 'json';

export function ExportMenu({ view, pending, onExport }: { view: '2d' | '3d'; pending: boolean; onExport: (format: ExportFormat) => void }) {
  const formats = [
    { id: 'png', icon: Image, label: view === '2d' ? 'PNG 平面图' : 'PNG 当前视角' },
    { id: 'pdf', icon: FileText, label: 'PDF 矢量图' },
    { id: 'svg', icon: FileCode2, label: 'SVG 矢量图' },
    { id: 'dxf', icon: FilePenLine, label: 'DXF CAD 图纸' },
    { id: 'json', icon: FileJson, label: 'JSON 方案文件' },
  ] as const;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="export-button" aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Download />}<span>导出</span><ChevronDown className="export-button-caret" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="export-menu">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2"><Download size={16} />按格式导出</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="export-menu">
          {formats.map(format => (
            <DropdownMenuItem key={format.id} disabled={pending} onSelect={() => onExport(format.id)}>
              <format.icon />{format.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2"><AppWindow size={16} />导出到其他软件</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="export-menu"><SoftwareSoonItems /></DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>;
}
