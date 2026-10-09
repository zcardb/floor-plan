import { Plus, X } from "lucide-react";
import { FurniturePicker } from "./FurniturePicker";
import { furniturePickerItems } from "./pickerItems";
import { addPick, removePick } from "../ai/picks";
import type { AiFurniturePick } from "../ai/types";
import type { LibraryItem } from "../model/types";

/**
 * 「家具：」一行：默认带出房间里现有的家具，同款合并显示 ×N，✕ 减一件；
 * 「新增」从完整家具目录里选（可搜索、可重复选）。
 */
export function FurnitureChips({ picks, catalog, onChange }: {
  picks: AiFurniturePick[];
  catalog: LibraryItem[];
  onChange: (picks: AiFurniturePick[]) => void;
}) {
  const nameOf = (catalogId: string) => catalog.find((item) => item.catalogId === catalogId)?.name ?? "未知家具";
  return <div className="ai-chips" role="list" aria-label="指定家具">
    {picks.map(({ catalogId, count }) => {
      const name = nameOf(catalogId);
      return <span className="ai-chip" role="listitem" key={catalogId}>
        <span>{name}{count > 1 && <b>×{count}</b>}</span>
        <button type="button" aria-label={count > 1 ? `${name}减少一件` : `移除${name}`} onClick={() => onChange(removePick(picks, catalogId))}><X size={12} /></button>
      </span>;
    })}
    <FurniturePicker items={furniturePickerItems(catalog)} onPick={(picked) => onChange(addPick(picks, picked.id))} label="新增家具">
      <button type="button" className="ai-chip-add" aria-label="新增家具"><Plus size={12} />新增</button>
    </FurniturePicker>
  </div>;
}
