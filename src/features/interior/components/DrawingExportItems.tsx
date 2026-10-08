import { FileCode2, FilePenLine } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { DrawingFormat } from '../model/drawingExport';
export function DrawingExportItems({disabled,onExport}:{disabled?:boolean;onExport:(format:DrawingFormat)=>void}){
  return <>
    <DropdownMenuItem disabled={disabled} onClick={()=>onExport('dxf')}><FilePenLine/>导出 CAD 图纸（DXF）</DropdownMenuItem>
    <DropdownMenuItem disabled={disabled} onClick={()=>onExport('svg')}><FileCode2/>导出矢量图（SVG）</DropdownMenuItem>
  </>;
}
