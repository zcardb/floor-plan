import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronDown, Layers, type LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Button } from '@/components/ui/button';
import { layerStatus, reorderFurniture, type LayerAction } from '../model/furniture-layer';
import type { Design } from '@/lib/floor-plan/types';

const LAYER_ACTIONS: { action: LayerAction; label: string; icon: LucideIcon; shortcut: string }[] = [
  { action: 'front', label: '置顶', icon: ArrowUpToLine, shortcut: 'Ctrl Shift ]' },
  { action: 'forward', label: '上移一层', icon: ArrowUp, shortcut: 'Ctrl ]' },
  { action: 'backward', label: '下移一层', icon: ArrowDown, shortcut: 'Ctrl [' },
  { action: 'back', label: '置底', icon: ArrowDownToLine, shortcut: 'Ctrl Shift [' },
];

/**
 * 家具图层下拉：置顶 / 上移一层 / 下移一层 / 置底。
 * 工具条（toolbar）与右侧属性面板（panel）共用，单选、多选都按整体调整。
 */
export function LayerMenu({ design, ids, change, variant }: {
  design: Design; ids: string[]; change: (fn: (d: Design) => Design) => void; variant: 'toolbar' | 'panel';
}) {
  const status = layerStatus(design, ids);
  const trigger = variant === 'toolbar'
    ? <button type="button" aria-label="图层顺序"><Layers size={15} />图层<ChevronDown size={12} /></button>
    : <Button type="button" size="sm" variant="outline" aria-label="图层顺序"><Layers />图层<ChevronDown size={12} /></Button>;
  return <DropdownMenu>
    <EditorTooltip label="平面图中的上下层顺序">
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    </EditorTooltip>
    <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="layer-menu">
      <DropdownMenuLabel className="wall-options-section">图层顺序</DropdownMenuLabel>
      {LAYER_ACTIONS.map(({ action, label, icon: Icon, shortcut }) =>
        <DropdownMenuItem key={action} disabled={action === 'front' || action === 'forward' ? status.atTop : status.atBottom}
          onSelect={() => change(d => reorderFurniture(d, ids, action))}>
          <Icon />{label}<DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
