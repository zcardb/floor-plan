import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DOOR_TYPE_LABEL, DOOR_TYPES, changeDoorType, doorType, type DoorType } from '@/lib/floor-plan/door-type';
import type { Design, Opening } from '@/lib/floor-plan/types';

/** 每种开启方式在平面图里的样子（与画布同一套符号）。 */
const PREVIEW: Record<DoorType, string[]> = {
  single: ['M2 4V18', 'M2 4H18', 'M2 4A16 16 0 0 1 18 4'],
  double: ['M2 4V18', 'M20 4V18', 'M2 4H11', 'M20 4H11', 'M2 4A9 9 0 0 1 11 4', 'M20 4A9 9 0 0 0 11 4'],
  sliding: ['M2 6H14V10H2Z', 'M8 10H20V14H8Z'],
};

/**
 * 门的开启方式下拉（单开 / 双开 / 推拉）：只改开启方式，位置和宽度不变，可撤销。
 * 图形选择优于文字描述，所以每项都带平面图符号预览；当前项带对勾。
 */
export function DoorTypeMenu({ design, door, change, variant = 'toolbar' }: {
  design: Design; door: Opening; change: (fn: (d: Design) => Design) => void; variant?: 'toolbar' | 'panel';
}) {
  const current = doorType(door);
  const trigger = variant === 'toolbar' ? (
    <button type="button" aria-label="门的开启方式">{DOOR_TYPE_LABEL[current]}<ChevronDown size={12} /></button>
  ) : (
    <button type="button" className="picker-trigger visual-select-trigger" aria-label="门的开启方式">
      <span>{DOOR_TYPE_LABEL[current]}</span><ChevronDown size={12} />
    </button>
  );
  return <DropdownMenu>
    <EditorTooltip label="单开 / 双开 / 推拉">
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    </EditorTooltip>
    <DropdownMenuContent align="start" sideOffset={8} collisionPadding={12} className="door-type-menu">
      <DropdownMenuLabel className="wall-options-section">门的开启方式</DropdownMenuLabel>
      {DOOR_TYPES.map(type => (
        <DropdownMenuItem key={type} className="door-type-item" aria-label={DOOR_TYPE_LABEL[type]} aria-current={type === current || undefined}
          onSelect={() => type !== current && change(d => changeDoorType(d, door.id, type))}>
          <svg className="door-type-preview" viewBox="0 0 22 22" aria-hidden="true">
            <path className="door-type-frame" d="M0 4H22M0 16H22" />
            {PREVIEW[type].map((d, i) => <path key={i} d={d} />)}
          </svg>
          <span>{DOOR_TYPE_LABEL[type]}</span>
          {type === current && <Check className="door-type-check" aria-hidden />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>;
}
