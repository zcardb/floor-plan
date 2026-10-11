import { ChevronDown, Ruler, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Layers } from '../model/types';

/** 视图设置里的图层开关：键 → 名称，顺序即显示顺序。 */
export const LAYER_ITEMS: [keyof Layers, string][] = [
  ['dims', '尺寸标注'],
  ['labels', '房间名称'],
  ['furn', '家具显示'],
  ['grid', '辅助网格'],
  ['bearing', '承重墙高亮'],
  ['snap', '贴墙吸附'],
];

/**
 * 顶栏右侧「视图」：文字按钮 + 下拉箭头（不用图标，意思更直白），下拉里是图层开关（勾选不关菜单）+ 显示比例。
 * 方案总览 / 户型设置 / 家具库 / 成本 / AI 等侧栏入口都在画布竖条上，这里不再放。
 */
export function ViewMenu({ layers, view, onToggleLayer, onRatio }: {
  layers: Layers;
  view: '2d' | '3d';
  onToggleLayer: (key: keyof Layers) => void;
  onRatio: (ratio: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="view-menu-trigger" aria-label="视图设置">
          视图
          <ChevronDown className="view-menu-caret" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="toolbar-menu view-menu">
        <p className="project-menu-heading">视图设置</p>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
