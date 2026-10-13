import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import type { CustomFloor, CustomOpening, CustomWall, Design } from '../model/types';
import type { CostEntry } from '../model/accountCostEntries';
import { defaultOpeningSize, surfaceKindOfCategory, type SurfaceKind } from '../model/hardMaterials';
import { FLOOR_CATEGORY } from '../model/floorMaterials';
import { CustomFloorForm } from './CustomFloorForm';
import { CustomColorMaterialForm } from './CustomColorMaterialForm';
import { CustomOpeningForm } from './CustomOpeningForm';
import { MaterialProcurementEditor } from './MaterialProcurementEditor';

export type MaterialSaves = {
  floor: (item: CustomFloor) => Promise<void>;
  opening: (item: CustomOpening) => Promise<void>;
} & Record<SurfaceKind, (item: CustomWall) => Promise<void>>;

/** 除单价外的字段是否改动（undefined 与缺省视为相同）。 */
const fieldsDiffer = (a: object, b: object) => {
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].some(key => key !== 'price' && (x[key] ?? null) !== (y[key] ?? null));
};

/** 内置门 / 窗没有款式对象，按标准尺寸展示。 */
const builtinOpening = (entry: CostEntry): CustomOpening => {
  const kind = entry.key === 'window' ? 'window' : 'door';
  return { key: entry.key, name: entry.name, kind, ...defaultOpeningSize(kind), price: null };
};

/**
 * 硬装（地面 / 墙面 / 门窗 / 屋面 / 吊顶）详情：与「新建」弹窗同一份表单。
 * 自定义材料所有项可改并同步到使用它的项目；内置材料只能改账号默认单价。
 */
export function AccountMaterialDialog({ entry, design, price, saves, applyDefaultPrice, change, busy, error, retry, onSaved, onClose }: {
  entry: CostEntry; design: Design; price: number | null; saves: MaterialSaves;
  applyDefaultPrice: (price: number | null) => Promise<boolean>;
  change: (update: (design: Design) => Design) => void | Promise<boolean>;
  busy: boolean; error: string; retry?: () => void;
  onSaved: (kind: keyof MaterialSaves) => void; onClose: () => void;
}) {
  const custom = !!entry.account;
  const surface = surfaceKindOfCategory(entry.category);
  const kind: keyof MaterialSaves = entry.category === FLOOR_CATEGORY ? 'floor' : surface ?? 'opening';
  /** 自建材料在账号库里的那一行（内置材料没有）。 */
  const stored = entry.account && entry.account.kind !== 'furniture' ? entry.account.item : undefined;

  /** 表单提交：几何 / 名称 / 颜色写回账号库（保留库中原单价），单价改动写入账号默认价。 */
  const save = async <T extends { key: string; name: string; price: number | null }>(item: T, original: T | undefined, write: (item: T) => Promise<void>) => {
    const { price: nextPrice, ...fields } = item;
    const changed = !!original && custom && fieldsDiffer(original, fields);
    if (changed) { await write({ ...fields, price: original!.price } as T); onSaved(kind); }
    if (nextPrice !== price && !(await applyDefaultPrice(nextPrice))) throw new Error('单价未能保存，请重试');
    if (changed || nextPrice !== price) notify.success(`「${item.name}」已保存${changed ? '，使用它的项目会同步更新' : ''}`);
    onClose();
  };

  const categoryField = <div className="custom-field">
    <Label htmlFor="material-category">分类</Label>
    <Select value={entry.category} disabled><SelectTrigger id="material-category" className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={entry.category}>{entry.category}</SelectItem></SelectContent></Select>
  </div>;
  const common = {
    categoryField, accountOnly: true, onCancel: onClose, priceOnly: !custom || !!retry, submitLabel: '保存修改',
    priceLabel: `账号默认单价 · 元 / ${entry.unit}`, priceHint: '仅影响未单独调价的项目；项目内改价仍以项目为准。留空表示未定价。',
  };
  const floorInitial: CustomFloor | undefined = kind === 'floor' && entry.floor ? { ...(stored as CustomFloor | undefined), key: entry.key, name: entry.floor.name, pattern: entry.floor.pattern, color: entry.floor.color, length: entry.floor.length, width: entry.floor.width, price } : undefined;
  const form = kind === 'floor' && floorInitial
    ? <CustomFloorForm {...common} initial={floorInitial} onSave={item => save(item, stored as CustomFloor | undefined, saves.floor)}
      extra={<div className="material-procurement-extra"><MaterialProcurementEditor design={{ ...design, rooms: [] }} material={entry.key} change={change} /></div>} />
    : kind === 'opening'
      ? <CustomOpeningForm {...common} initial={{ ...(entry.opening ?? builtinOpening(entry)), price }} onSave={item => save(item, stored as CustomOpening | undefined, saves.opening)} />
      : <CustomColorMaterialForm {...common} kind={kind as SurfaceKind} initial={{ key: entry.key, name: entry.wall?.name ?? entry.name, color: entry.wall?.color ?? '#e8e1d4', price }}
        onSave={item => save(item, stored as CustomWall | undefined, saves[kind as SurfaceKind])} />;

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="custom-furniture-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{entry.name}</DialogTitle>
        <DialogDescription>{entry.category} · {custom ? '自定义材料，所有项都可修改，修改会同步到使用它的项目' : '内置材料，可设置账号默认单价'}；项目里单独改过的单价以项目为准。</DialogDescription>
      </DialogHeader>
      {error && <div className="cost-save-error" role="alert"><span>{error}</span>{retry && <Button type="button" variant="outline" disabled={busy} onClick={retry}>重试保存</Button>}</div>}
      {form}
    </DialogContent>
  </Dialog>;
}
