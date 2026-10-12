import { furnitureKey } from "@/lib/floor-plan/costs";
import { formatMeters } from "@/lib/floor-plan/length-units";
import type { Design, Room } from "@/lib/floor-plan/types";
import { furnitureInRoom } from "./context";
import type { AiCatalog, AiFurniturePick, AiRequiredItem } from "../types";

/** 选中一件：已有同款时件数 +1，否则追加到末尾。 */
export const addPick = (picks: AiFurniturePick[], catalogId: string): AiFurniturePick[] =>
  picks.some((pick) => pick.catalogId === catalogId)
    ? picks.map((pick) => (pick.catalogId === catalogId ? { ...pick, count: pick.count + 1 } : pick))
    : [...picks, { catalogId, count: 1 }];

/** ✕：件数减一，减到 0 时移除。 */
export const removePick = (picks: AiFurniturePick[], catalogId: string): AiFurniturePick[] =>
  picks.flatMap((pick) => (pick.catalogId === catalogId ? (pick.count > 1 ? [{ ...pick, count: pick.count - 1 }] : []) : [pick]));

/** 默认清单 = 房间里现有的家具（目录里认得出的才算）；现有家具改过尺寸的，沿用它的尺寸。 */
export function initialPicks(design: Design, room: Room, catalog: AiCatalog): AiFurniturePick[] {
  return furnitureInRoom(design, room).reduce<AiFurniturePick[]>((picks, f) => {
    const id = furnitureKey(f), item = catalog.byId.get(id);
    if (!item) return picks;
    const next = addPick(picks, id);
    const resized = Math.round(f.w) !== Math.round(item.w) || Math.round(f.d) !== Math.round(item.d);
    return resized && !picks.some((pick) => pick.catalogId === id)
      ? next.map((pick) => (pick.catalogId === id ? { ...pick, size: { w: Math.round(f.w), d: Math.round(f.d) } } : pick))
      : next;
  }, []);
}

/** 改尺寸；与目录尺寸相同即视为恢复默认。 */
export const resizePick = (picks: AiFurniturePick[], catalogId: string, size: { w: number; d: number } | undefined, base?: { w: number; d: number }): AiFurniturePick[] =>
  picks.map((pick) => {
    if (pick.catalogId !== catalogId) return pick;
    const same = !size || (base && size.w === base.w && size.d === base.d);
    const { size: _old, ...rest } = pick;
    void _old;
    return same ? rest : { ...rest, size };
  });

/**
 * 本次请求用的目录：清单里改过尺寸的家具，以新尺寸进入目录（代号不变），
 * 模型按新尺寸排布，落地时家具也按新尺寸生成。
 */
export function withPickSizes(catalog: AiCatalog, picks: AiFurniturePick[]): AiCatalog {
  const sized = new Map(picks.flatMap((pick) => (pick.size ? [[pick.catalogId, pick.size] as const] : [])));
  if (!sized.size) return catalog;
  const byId = new Map(catalog.byId), byCode = new Map(catalog.byCode);
  const entries = catalog.entries.map((entry) => {
    const size = sized.get(entry.catalogId);
    if (!size) return entry;
    const item = { ...catalog.byId.get(entry.catalogId)!, ...size };
    byId.set(entry.catalogId, item);
    byCode.set(entry.code, item);
    return { ...entry, ...size };
  });
  return { entries, byId, byCode, codeOf: catalog.codeOf };
}

/** 清单 → 发给后端的代号清单。 */
export const requiredOf = (picks: AiFurniturePick[], catalog: AiCatalog): AiRequiredItem[] =>
  picks.flatMap((pick) => {
    const code = catalog.codeOf(pick.catalogId);
    return code ? [{ code, count: pick.count }] : [];
  });

/** 清单 → 回显文字，例如「双人床 1.8m、床头柜 ×2」。 */
export const pickNames = (picks: AiFurniturePick[], catalog: AiCatalog): string[] =>
  picks.map((pick) => `${catalog.byId.get(pick.catalogId)?.name ?? "未知家具"}${pick.size ? `（${formatMeters(pick.size.w)} × ${formatMeters(pick.size.d)} m）` : ""}${pick.count > 1 ? ` ×${pick.count}` : ""}`);
