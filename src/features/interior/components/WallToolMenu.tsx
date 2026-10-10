import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import type { Tool } from '../model/types';
import { isWallTool, wallTools } from './wallTools';

/** 顶部工具栏的「墙 ▾」：墙 / 垭口 / 房间分隔线。按钮显示当前选用的那一项。 */
export function WallToolMenu({ tool, setTool }: { tool: Tool; setTool: (tool: Tool) => void }) {
  const active = isWallTool(tool);
  const current = wallTools.find(t => t.tool === tool) ?? wallTools[0]!;
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <span className="tool-button-wrap">
        <EditorTooltip label="墙体工具">
          <DropdownMenuTrigger asChild>
            <button className={'tool-button ' + (active ? 'active' : '')} aria-label="墙体工具" aria-pressed={active}>
              <Icon size={16} />
              <span>{current.label}</span>
              <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
        </EditorTooltip>
      </span>
      <DropdownMenuContent align="start" className="wall-tool-menu">
        {wallTools.map(t => (
          <DropdownMenuItem key={t.tool} onSelect={() => setTool(t.tool)} data-active={t.tool === tool || undefined}>
            <t.icon />
            <span className="wall-tool-item">
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
