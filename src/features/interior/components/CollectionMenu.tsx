import { Box, Layers3, Ruler, Check } from 'lucide-react';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Layers } from '../model/types';

/** 视图二级菜单里的图层开关：键 → 名称，顺序即显示顺序。 */
export const LAYER_ITEMS: [keyof Layers, string][] = [
  ['dims', '尺寸标注'],
  ['labels', '房间名称'],
  ['furn', '家具显示'],
  ['grid', '辅助网格'],
  ['bearing', '承重墙高亮'],
  ['snap', '贴墙吸附'],
];

/**
 * 顶栏右侧的「集合」菜单：一路平铺、不分组，
 * 视图 ▸（图层开关 + 显示比例）→ 家具库 / 户型设置 → 方案总览 / 成本。
 * AI 模式不进这里（它只在画布竖条上），游客只保留「视图 ▸」与「家具库」。
 */
export function CollectionMenu({ layers, view, active, loggedIn, onToggleLayer, onRatio, onOpen }: {
  layers: Layers;
  view: '2d' | '3d';
  /** 当前打开的侧栏，用于高亮。 */
  active: string | null;
  loggedIn: boolean;
  onToggleLayer: (key: keyof Layers) => void;
  onRatio: (ratio: number) => void;
  onOpen: (kind: 'library' | 'settings' | 'overview' | 'cost') => void;
}) {
  const entry = (kind: 'library' | 'settings' | 'overview' | 'cost', label: string) => (
    <DropdownMenuItem key={kind} className="project-menu-entry" data-active={active === kind || undefined} onSelect={() => onOpen(kind)}>
      {label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <EditorTooltip label="集合">
        <DropdownMenuTrigger asChild>
          <button type="button" className="toolbar-icon collection-trigger" aria-label="集合">
            <Box size={17} />
          </button>
        </DropdownMenuTrigger>
      </EditorTooltip>
      <DropdownMenuContent align="end" className="collection-menu">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="project-menu-entry">
            <Layers3 size={15} />
            视图
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="collection-submenu" sideOffset={6}>
            {LAYER_ITEMS.map(([key, label]) => (
              <DropdownMenuItem
                key={key}
                /* 勾选不关闭菜单，方便连续开关多项。 */
                onSelect={(e) => { e.preventDefault(); onToggleLayer(key); }}
              >
                <span className={'layer-checkbox' + (layers[key] ? ' checked' : '')}>
                  {layers[key] && <Check size={11} />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {[60, 100].map((ratio) => (
              <DropdownMenuItem key={ratio} disabled={view !== '2d'} onSelect={() => onRatio(ratio)}>
                <Ruler />
                显示比例 1:{ratio}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {entry('library', '家具库')}
        {loggedIn && entry('settings', '户型设置')}
        {loggedIn && <DropdownMenuSeparator />}
        {loggedIn && entry('overview', '方案总览')}
        {loggedIn && entry('cost', '成本')}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
