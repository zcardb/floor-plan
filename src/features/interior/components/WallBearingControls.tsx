import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { isBearingWall, setWallBearing } from '../model/wallPolicy';
import type { Design, Wall } from '../model/types';

export function WallBearingControls({ design, wall, change }: { design: Design; wall: Wall; change: (fn: (d: Design) => Design) => void }) {
  const confirm = useConfirm();
  const original = wall.kind === 'bearing', bearing = isBearingWall(wall), demolished = design.demolished.includes(wall.id);
  const toggle = async () => {
    if (bearing && !(await confirm({ title: '取消承重标记？', description: '取消软件标记不代表现实中可拆除，墙体承重性质仍须依据建筑结构图或专业评估。', confirmText: '取消标记' }))) return;
    try { change(d => setWallBearing(d, wall.id, !bearing)); notify.success(bearing ? '已取消承重标记' : '已标记为承重墙，墙体与洞口已保护'); }
    catch (error) { notify.error(bearing ? '取消承重标记失败' : '标记承重墙失败', error); }
  };
  return <div className="wall-bearing-controls">
    <p className="wall-bearing-status">{original ? <LockKeyhole size={15} /> : <ShieldCheck size={15} />}<span>{original ? '原始承重墙 · 已锁定' : bearing ? '承重墙 · 用户标记' : '未标记承重'}</span></p>
    {!original && <Button type="button" variant={bearing ? 'outline' : 'secondary'} size="sm" disabled={demolished} onClick={() => void toggle()}>{bearing ? '取消承重标记' : '标记为承重墙'}</Button>}
    <p className="muted-note">{demolished ? '请先撤销拆除，再标记承重。' : bearing ? '墙体和已有门窗洞口已保护，不能拆除、移动或修改尺寸。' : '标记后将保护墙体及已有门窗洞口。'}</p>
    <p className="muted-note">仅用于设计示意，承重性质须依据结构图或专业评估。</p>
  </div>;
}
