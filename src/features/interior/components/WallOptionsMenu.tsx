import { ChevronDown, Scissors, Combine, ShieldCheck, ShieldOff, Hammer, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { notify } from '@/lib/notify';
import { canDemolishWall, canEditWall, isBearingWall, setWallBearing } from '../model/wallPolicy';
import { toggleWallDemolition } from '../model/wallRemoval';
import { wallMergeGroup } from '../model/wallMerge';
import type { Design, Wall } from '../model/types';

export function WallOptionsMenu({ design, wall, change, splitWall, mergeWall, removeWall }: {
  design: Design; wall: Wall; change: (fn: (d: Design) => Design) => void;
  splitWall?: (id: string) => void; mergeWall?: (id: string) => void; removeWall?: (id: string) => void;
}) {
  const bearing = isBearingWall(wall), original = wall.kind === 'bearing', demolished = design.demolished.includes(wall.id);
  const group = wallMergeGroup(design, wall.id);
  const deletable = canEditWall(design, wall) && !demolished && !!removeWall;
  const demolishable = canDemolishWall(wall);
  // Marking is a reversible drawing annotation (undo restores it), so both directions apply in one click.
  const toggle = () => {
    if (original || demolished) return;
    try { change(d => setWallBearing(d, wall.id, !bearing)); notify.success(bearing ? '已取消承重标记' : '已标记承重，墙体与洞口已保护'); }
    catch (e) { notify.error('修改承重标记失败', e); }
  };
  const demolish = () => {
    try { change(d => toggleWallDemolition(d, wall.id)); notify.success(demolished ? '已撤销拆除，墙体恢复保留' : '已标记拆除，可撤销恢复'); }
    catch (e) { notify.error('修改拆除标记失败', e); }
  };
  const removeHint = demolished
    ? '请先撤销拆除，再删除墙体'
    : canEditWall(design, wall)
      ? (removeWall ? '删除这面隔墙及墙上门窗，可撤销' : '请在 2D 选择模式操作')
      : bearing ? '承重墙不可删除' : '参考户型原始墙体不可删除，可用下方拆除标记';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" className="wall-options-trigger" aria-label="墙选项">墙选项<ChevronDown size={14} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="wall-options-menu">
      <DropdownMenuLabel className="wall-options-section">墙段编辑</DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item" aria-label="分割墙段" disabled={demolished || !splitWall} onSelect={() => splitWall?.(wall.id)}>
        <Scissors size={16} /><span className="wall-options-copy"><span>分割墙段</span><small>{demolished ? '请先撤销拆除' : !splitWall ? '请在 2D 选择模式操作' : '按距离划分为独立墙段'}</small></span>
      </DropdownMenuItem>
      <DropdownMenuItem className="wall-options-item" aria-label="取消分割" disabled={demolished || !mergeWall || group.length < 2} onSelect={() => mergeWall?.(wall.id)}>
        <Combine size={16} /><span className="wall-options-copy"><span>取消分割</span><small>{demolished ? '请先撤销拆除' : group.length < 2 ? '当前没有可合并的相邻墙段' : `合并 ${group.length} 段连续墙，保留承重保护`}</small></span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuLabel className="wall-options-section">承重属性<span className="wall-options-status">{original ? '原始 · 已锁定' : bearing ? '已标记' : '未标记'}</span></DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item" aria-label={bearing ? '取消标记承重' : '标记承重'} disabled={original || demolished} onSelect={toggle}>
        {bearing ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}<span className="wall-options-copy"><span>{bearing ? '取消标记承重' : '标记承重'}</span><small>{original ? '原始承重墙不能解除标记' : demolished ? '请先撤销拆除' : bearing ? '移除软件标记，可撤销' : '保护墙体与已有门窗洞口'}</small></span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuLabel className="wall-options-section">墙体删除<span className="wall-options-status">{demolished ? '已标记拆除' : '保留'}</span></DropdownMenuLabel>
      <DropdownMenuItem className="wall-options-item danger-item" aria-label="删除当前墙" disabled={!deletable} onSelect={() => removeWall?.(wall.id)}>
        <Trash2 size={16} /><span className="wall-options-copy"><span>删除当前墙</span><small>{removeHint}</small></span>
      </DropdownMenuItem>
      <DropdownMenuItem className="wall-options-item danger-item" aria-label={demolished ? '撤销拆除当前墙' : '标记拆除当前墙'} disabled={!demolishable} onSelect={demolish}>
        {demolished ? <Undo2 size={16} /> : <Hammer size={16} />}<span className="wall-options-copy"><span>{demolished ? '撤销拆除当前墙' : '标记拆除当前墙'}</span><small>{demolishable ? (demolished ? '撤销拆除，恢复为保留墙体' : '绘出拆改标注，可计入拆改造价') : '承重墙与建筑外墙不可拆除'}</small></span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
