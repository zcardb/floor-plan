import { Armchair, ChevronDown, Trash2, Eraser } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

/** 房间删除：清空家具（Delete 快捷键）与删除房间（只拆本房间独立墙）两个操作。 */
export function RoomDeleteMenu({ furniture, clear, removeRoom }: {
  /** 房间内家具件数。 */
  furniture: number;
  clear: () => void;
  /** 不传时（如 3D 视图）「删除房间」不可用。 */
  removeRoom?: () => void;
}) {
  return <DropdownMenu>
    <EditorTooltip label="删除">
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="房间删除选项"><Trash2 size={15} /><ChevronDown size={12} /></button>
      </DropdownMenuTrigger>
    </EditorTooltip>
    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="wall-options-menu">
      <DropdownMenuLabel className="wall-options-section">房间删除</DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item" aria-label="清空房间家具" disabled={!furniture} onSelect={clear}>
        <Armchair size={16} /><span className="wall-options-copy"><span>清空房间家具</span><small>{furniture ? `删除房内 ${furniture} 件家具，墙体不动 · Delete` : '这个房间里没有家具'}</small></span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuItem className="wall-options-item danger-item" aria-label="删除房间" disabled={!removeRoom} onSelect={() => removeRoom?.()}>
        <Eraser size={16} /><span className="wall-options-copy"><span>删除房间</span><small>{removeRoom ? '删除房间、房内家具及本房间独立的墙，共用墙与承重墙保留' : '请在 2D 选择模式操作'}</small></span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
