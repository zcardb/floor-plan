import { notify } from '@/lib/notify';
import { applyOpeningVariant, pickableOpenings } from '../model/hardMaterials';
import type { CustomOpening, Design, Opening } from '../model/types';
import { EditorSelect } from './EditorSelect';

const STANDARD = '__standard__';

/** 门窗款式选择：标准门/窗 + 项目与账号库中同类自定义款式。 */
export function OpeningVariantSelect({ design, opening, accountOpenings = [], change, disabled = false }: {
  design: Design; opening: Opening; accountOpenings?: CustomOpening[]; change: (fn: (d: Design) => Design) => void; disabled?: boolean;
}) {
  const choices = pickableOpenings(design, accountOpenings, opening.kind);
  // 只有标准款时无可切换项，不显示款式选择。
  if (!choices.length && !opening.variant) return null;
  const standard = opening.kind === 'door' ? '标准门' : '标准窗';
  const select = (value: string) => {
    let kept = false;
    try {
      change(d => { const result = applyOpeningVariant(d, opening.id, value === STANDARD ? null : value, accountOpenings); kept = result.widthKept; return result.design; });
    } catch (cause) { notify.error('切换门窗款式失败', cause); return; }
    if (kept) notify.warning('已切换款式，宽度保持不变', '墙段长度不足或会与其他门窗重叠');
  };
  return <EditorSelect label="款式" value={opening.variant ?? STANDARD} disabled={disabled}
    options={[{ value: STANDARD, label: standard }, ...choices.map(({ key, item, fromAccount }) => ({ value: key, label: fromAccount ? `${item.name} · 账号库` : item.name }))]}
    onChange={select} />;
}
