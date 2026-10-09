import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FurniturePicker } from "./FurniturePicker";
import { furniturePickerItems } from "./pickerItems";
import { addPick, removePick, resizePick } from "../ai/picks";
import { formatMeters, meterDraft, parseMeterDraft } from "../model/lengthUnits";
import type { AiFurniturePick } from "../ai/types";
import type { LibraryItem } from "../model/types";

/** 家具尺寸可改范围（mm）。 */
const SIZE_LIMIT = { min: 100, max: 6000 };

/** 点击家具标签弹出的尺寸编辑：宽（沿墙）× 深，可恢复目录尺寸。 */
function SizeEditor({ item, pick, onChange, onDone }: {
  item: LibraryItem;
  pick: AiFurniturePick;
  onChange: (size: { w: number; d: number } | undefined) => void;
  onDone: () => void;
}) {
  const current = pick.size ?? { w: item.w, d: item.d };
  const [w, setW] = useState(meterDraft(current.w)), [d, setD] = useState(meterDraft(current.d));
  const next = { w: parseMeterDraft(w), d: parseMeterDraft(d) };
  const valid = [next.w, next.d].every((n) => Number.isFinite(n) && n >= SIZE_LIMIT.min && n <= SIZE_LIMIT.max);
  const save = () => { if (valid) { onChange(next); onDone(); } };
  return <form className="ai-size-editor" onSubmit={(e) => { e.preventDefault(); save(); }}>
    <p className="ai-size-editor-title">{item.name}<small>默认 {formatMeters(item.w)} × {formatMeters(item.d)} m</small></p>
    <div className="ai-size-editor-row">
      <div className="cms-field"><Label htmlFor="ai-pick-w">宽 / m</Label><Input id="ai-pick-w" type="number" inputMode="decimal" step={0.05} min={SIZE_LIMIT.min / 1000} max={SIZE_LIMIT.max / 1000} aria-invalid={!valid || undefined} value={w} onChange={(e) => setW(e.target.value)} autoFocus /></div>
      <span aria-hidden="true">×</span>
      <div className="cms-field"><Label htmlFor="ai-pick-d">深 / m</Label><Input id="ai-pick-d" type="number" inputMode="decimal" step={0.05} min={SIZE_LIMIT.min / 1000} max={SIZE_LIMIT.max / 1000} aria-invalid={!valid || undefined} value={d} onChange={(e) => setD(e.target.value)} /></div>
    </div>
    {!valid && <p className="ai-size-hint is-error" role="alert">尺寸需在 {SIZE_LIMIT.min / 1000}–{SIZE_LIMIT.max / 1000} m 之间</p>}
    <div className="ai-size-editor-actions">
      <button type="button" className="ai-link" disabled={!pick.size} onClick={() => { onChange(undefined); onDone(); }}><RotateCcw size={12} />恢复默认</button>
      <span />
      <button type="submit" className="ai-size-editor-save" disabled={!valid}>确定</button>
    </div>
  </form>;
}

/**
 * 「家具：」一行：默认带出房间里现有的家具，同款合并显示 ×N，✕ 减一件；
 * 点标签可改尺寸（主要是宽 × 深）；「新增」从完整家具目录里选（可搜索、可重复选）。
 */
export function FurnitureChips({ picks, catalog, onChange }: {
  picks: AiFurniturePick[];
  catalog: LibraryItem[];
  onChange: (picks: AiFurniturePick[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const itemOf = (catalogId: string) => catalog.find((item) => item.catalogId === catalogId);
  return <div className="ai-chips" role="list" aria-label="指定家具">
    {picks.map((pick) => {
      const item = itemOf(pick.catalogId), name = item?.name ?? "未知家具";
      return <span className={"ai-chip" + (pick.size ? " is-resized" : "")} role="listitem" key={pick.catalogId}>
        <Popover open={editing === pick.catalogId} onOpenChange={(open) => setEditing(open ? pick.catalogId : null)}>
          <PopoverTrigger asChild disabled={!item}>
            <button type="button" className="ai-chip-body" aria-label={`修改${name}尺寸`}>
              {name}
              {pick.size && <small>{formatMeters(pick.size.w)} × {formatMeters(pick.size.d)}</small>}
              {pick.count > 1 && <b>×{pick.count}</b>}
            </button>
          </PopoverTrigger>
          {item && <PopoverContent align="start" collisionPadding={12} className="ai-size-popover">
            <SizeEditor item={item} pick={pick} onDone={() => setEditing(null)}
              onChange={(size) => onChange(resizePick(picks, pick.catalogId, size, { w: item.w, d: item.d }))} />
          </PopoverContent>}
        </Popover>
        <button type="button" aria-label={pick.count > 1 ? `${name}减少一件` : `移除${name}`} onClick={() => onChange(removePick(picks, pick.catalogId))}><X size={12} /></button>
      </span>;
    })}
    <FurniturePicker items={furniturePickerItems(catalog)} onPick={(picked) => onChange(addPick(picks, picked.id))} label="新增家具">
      <button type="button" className="ai-chip-add" aria-label="新增家具"><Plus size={12} />新增</button>
    </FurniturePicker>
  </div>;
}
