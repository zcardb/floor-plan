import { Check, ChevronDown, Combine, LockKeyhole, Scissors, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { isBearingWall, setWallBearing } from '../model/wallPolicy';
import { wallMergeGroup } from '../model/wallMerge';
import { convertStructure, structureForm, type StructureTarget, type WallForm } from '../model/wallConvert';
import { wallTools } from './wallTools';
import type { Design, Selection } from '../model/types';

/** 替换选项与「硬装 · 墙」同一套图标与名称，短说明控制在一行内。 */
const FORMS: { form: WallForm; hint: string }[] = [
  { form: 'wall', hint: '实体墙' },
  { form: 'passage', hint: '整面开洞' },
  { form: 'separator', hint: '只分房间' },
];
const toolOf = (form: WallForm) => wallTools.find(t => t.tool === form)!;
const shortLabel = (form: WallForm) => (form === 'separator' ? '分隔线' : toolOf(form).label);

/**
 * 墙选项：墙、垭口、房间分隔线共用。顶部「替换为 墙 / 垭口 / 分隔线」（卡片单选，当前形态高亮）；
 * 选中墙时下面再有分割、合并、承重开关与删除。替换与承重都即时生效、可撤销，不弹确认。
 */
export function WallOptionsMenu({ design, target, change, select, splitWall, mergeWall, removeWall }: {
  design: Design; target: StructureTarget; change: (fn: (d: Design) => Design) => void; select?: (s: Selection) => void;
  splitWall?: (id: string) => void; mergeWall?: (id: string) => void; removeWall?: (id: string) => void;
}) {
  const form = structureForm(design, target);
  if (!form) return null;
  const wall = target.kind === 'wall' ? design.walls.find(w => w.id === target.id)! : null;
  const { current, locked } = form, lock = Object.values(locked)[0];

  const replace = (to: WallForm) => {
    if (to === current) return;
    try {
      const result = convertStructure(design, target, to);
      change(() => result.design);
      select?.(result.select);
      const extra = result.removedOpenings ? `，原有 ${result.removedOpenings} 个门窗已移除` : '';
      notify.success(`已替换为${shortLabel(to)}${extra}，可撤销`);
    } catch (e) { notify.error('替换失败', e); }
  };

  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" className="wall-options-trigger" aria-label="墙选项">墙选项<ChevronDown size={12} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="wall-options-menu">
      <DropdownMenuLabel className="wall-options-section">替换为</DropdownMenuLabel>
      <div className="wall-form-grid" role="group" aria-label="替换墙体类型">
        {FORMS.map(({ form, hint }) => {
          const { icon: Icon } = toolOf(form), active = form === current;
          return (
            <DropdownMenuItem key={form} className={cn('wall-form-card', active && 'is-current')} aria-label={`替换为${shortLabel(form)}`}
              aria-current={active || undefined} disabled={!!locked[form]} onSelect={() => replace(form)}>
              {active && <Check className="wall-form-check" aria-hidden />}
              <Icon className="wall-form-icon" aria-hidden />
              <span className="wall-form-label">{shortLabel(form)}</span>
              <small className="wall-form-hint">{hint}</small>
            </DropdownMenuItem>
          );
        })}
      </div>
      {lock && <p className="wall-options-note"><LockKeyhole aria-hidden />{lock}</p>}

      {wall && wallActions({ design, wallId: wall.id, change, splitWall, mergeWall, removeWall })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** 只属于墙体的操作：分割、合并、承重开关、删除（纯渲染函数，不含 hooks）。 */
function wallActions({ design, wallId, change, splitWall, mergeWall, removeWall }: {
  design: Design; wallId: string; change: (fn: (d: Design) => Design) => void;
  splitWall?: (id: string) => void; mergeWall?: (id: string) => void; removeWall?: (id: string) => void;
}) {
  const wall = design.walls.find(w => w.id === wallId)!;
  const bearing = isBearingWall(wall);
  const group = wallMergeGroup(design, wall.id);
  // 承重是可撤销的图纸标注，开关一键生效。
  const toggleBearing = () => {
    try { change(d => setWallBearing(d, wall.id, !bearing)); notify.success(bearing ? '已取消承重，墙体可编辑' : '已标记承重，墙体已锁定'); }
    catch (e) { notify.error('修改承重标记失败', e); }
  };
  return <>
      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuItem className="wall-options-row" aria-label="分割墙段" disabled={!splitWall} onSelect={() => splitWall?.(wall.id)}>
        <Scissors aria-hidden /><span>分割墙段</span><small>{splitWall ? '按距离分段' : '仅 2D 可用'}</small>
      </DropdownMenuItem>
      <DropdownMenuItem className="wall-options-row" aria-label="取消分割" disabled={!mergeWall || group.length < 2} onSelect={() => mergeWall?.(wall.id)}>
        <Combine aria-hidden /><span>取消分割</span><small>{group.length < 2 ? '无相邻墙段' : `合并 ${group.length} 段`}</small>
      </DropdownMenuItem>
      <DropdownMenuItem className="wall-options-row" role="menuitemcheckbox" aria-checked={bearing} aria-label={bearing ? '取消标记承重' : '标记承重'}
        onSelect={e => { e.preventDefault(); toggleBearing(); }}>
        <ShieldCheck aria-hidden /><span>承重墙</span><small>{bearing ? '已锁定' : '标记后锁定'}</small>
        <span className="wall-options-switch" data-state={bearing ? 'checked' : 'unchecked'} aria-hidden><span /></span>
      </DropdownMenuItem>

      <DropdownMenuSeparator className="wall-options-divider" />
      <DropdownMenuItem className="wall-options-row danger-item" aria-label="删除当前墙" disabled={bearing || !removeWall} onSelect={() => removeWall?.(wall.id)}>
        <Trash2 aria-hidden /><span>删除墙体</span><small>{bearing ? '先取消承重' : removeWall ? '连同墙上门窗' : '仅 2D 可用'}</small>
      </DropdownMenuItem>
  </>;
}
