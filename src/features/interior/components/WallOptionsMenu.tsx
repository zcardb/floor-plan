import { ChevronDown, Scissors, Combine, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { notify } from '@/lib/notify';
import { isBearingWall, setWallBearing } from '../model/wallPolicy';
import { wallMergeGroup } from '../model/wallMerge';
import type { Design, Wall } from '../model/types';

export function WallOptionsMenu({ design, wall, change, splitWall, mergeWall }: {
  design: Design; wall: Wall; change: (fn: (d: Design) => Design) => void;
  splitWall?: (id: string) => void; mergeWall?: (id: string) => void;
}) {
  const confirm = useConfirm();
  const bearing = isBearingWall(wall), original = wall.kind === 'bearing', demolished = design.demolished.includes(wall.id);
  const group = wallMergeGroup(design, wall.id);
  const toggle = async () => {
    if (original || demolished) return;
    if (bearing && !await confirm({ title: '取消承重标记？', description: '取消软件标记不代表现实中可拆除，仍须依据结构图或专业评估。', confirmText: '取消标记承重' })) return;
    try { change(d => setWallBearing(d, wall.id, !bearing)); notify.success(bearing ? '已取消承重标记' : '已标记承重，墙体与洞口已保护'); }
    catch (e) { notify.error('修改承重标记失败', e); }
  };
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" aria-label="墙选项">墙选项<ChevronDown size={14} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>{original ? '原始承重墙 · 已锁定' : bearing ? '承重墙 · 用户标记' : '未标记承重'}</DropdownMenuLabel>
      <DropdownMenuItem disabled={demolished || !splitWall} onSelect={() => splitWall?.(wall.id)}><Scissors />分割墙段</DropdownMenuItem>
      <DropdownMenuItem disabled={demolished || !mergeWall || group.length < 2} onSelect={() => mergeWall?.(wall.id)}><Combine />取消分割</DropdownMenuItem>
      {group.length < 2 && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">无可合并的兼容连续墙段</DropdownMenuLabel>}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={original || demolished} onSelect={() => void toggle()}>{bearing ? <ShieldOff /> : <ShieldCheck />}{bearing ? '取消标记承重' : '标记承重'}</DropdownMenuItem>
      {(original || demolished) && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{original ? '原始承重标记不能解除' : '请先撤销拆除'}</DropdownMenuLabel>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
