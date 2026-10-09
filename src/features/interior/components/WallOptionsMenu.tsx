import { ChevronDown, Scissors, Combine, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { notify } from '@/lib/notify';
import { isBearingWall, setWallBearing } from '../model/wallPolicy';
import { wallMergeGroup } from '../model/wallMerge';
import type { Design, Wall } from '../model/types';

/** 墙选项：分割 / 取消分割 / 承重切换 / 删除，所有墙体同一套规则。 */
export function WallOptionsMenu({ design, wall, change, splitWall, mergeWall, removeWall }: {
  design: Design; wall: Wall; change: (fn: (d: Design) => Design) => void;
  splitWall?: (id: string) => void; mergeWall?: (id: string) => void; removeWall?: (id: string) => void;
}) {
  const bearing = isBearingWall(wall);
  const group = wallMergeGroup(design, wall.id);
  // Marking is a reversible drawing annotation (undo restores it), so both directions apply in one click.
  const toggle = () => {
    try { change(d => setWallBearing(d, wall.id, !bearing)); notify.success(bearing ? '已取消承重标记，墙体可删除' : '已标记承重，墙体受保护'); }
    catch (e) { notify.error('修改承重标记失败', e); }
  };
  const removeHint = bearing ? '承重墙不可删除，请先取消承重标记' : removeWall ? '删除这面墙及墙上门窗，可撤销' : '请在 2D 选择模式操作';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" className="wall-options-trigger" aria-label="墙选项">墙选项<ChevronDown size={12} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="wall-options-menu">
      <DropdownMenuLabel className="wall-options-section">墙段编辑</DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item" aria-label="分割墙段" disabled={!splitWall} onSelect={() => splitWall?.(wall.id)}>
        <Scissors size={16} /><span className="wall-options-copy"><span>分割墙段</span><small>{splitWall ? '按距离划分为独立墙段' : '请在 2D 选择模式操作'}</small></span>
      </DropdownMenuItem>
      <DropdownMenuItem className="wall-options-item" aria-label="取消分割" disabled={!mergeWall || group.length < 2} onSelect={() => mergeWall?.(wall.id)}>
        <Combine size={16} /><span className="wall-options-copy"><span>取消分割</span><small>{group.length < 2 ? '当前没有可合并的相邻墙段' : `合并 ${group.length} 段连续墙`}</small></span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuLabel className="wall-options-section">承重属性<span className="wall-options-status">{bearing ? '已标记' : '未标记'}</span></DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item" aria-label={bearing ? '取消标记承重' : '标记承重'} onSelect={toggle}>
        {bearing ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}<span className="wall-options-copy"><span>{bearing ? '取消标记承重' : '标记承重'}</span><small>{bearing ? '取消后可删除，可撤销' : '标记后不可删除'}</small></span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuLabel className="wall-options-section">墙体删除<span className="wall-options-status">{bearing ? '受保护' : '可删除'}</span></DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item danger-item" aria-label="删除当前墙" disabled={bearing || !removeWall} onSelect={() => removeWall?.(wall.id)}>
        <Trash2 size={16} /><span className="wall-options-copy"><span>删除当前墙</span><small>{removeHint}</small></span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
