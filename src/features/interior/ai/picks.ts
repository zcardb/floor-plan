import { furnitureKey } from "../model/costs";
import type { Design, Room } from "../model/types";
import { furnitureInRoom } from "./context";
import type { AiCatalog, AiFurniturePick, AiRequiredItem } from "./types";

/** 选中一件：已有同款时件数 +1，否则追加到末尾。 */
export const addPick = (picks: AiFurniturePick[], catalogId: string): AiFurniturePick[] =>
  picks.some((pick) => pick.catalogId === catalogId)
    ? picks.map((pick) => (pick.catalogId === catalogId ? { ...pick, count: pick.count + 1 } : pick))
    : [...picks, { catalogId, count: 1 }];

/** ✕：件数减一，减到 0 时移除。 */
export const removePick = (picks: AiFurniturePick[], catalogId: string): AiFurniturePick[] =>
  picks.flatMap((pick) => (pick.catalogId === catalogId ? (pick.count > 1 ? [{ ...pick, count: pick.count - 1 }] : []) : [pick]));

/** 默认清单 = 房间里现有的家具（目录里认得出的才算）。 */
export function initialPicks(design: Design, room: Room, catalog: AiCatalog): AiFurniturePick[] {
  return furnitureInRoom(design, room).reduce<AiFurniturePick[]>((picks, f) => {
    const id = furnitureKey(f);
    return catalog.byId.has(id) ? addPick(picks, id) : picks;
  }, []);
}

/** 清单 → 发给后端的代号清单。 */
export const requiredOf = (picks: AiFurniturePick[], catalog: AiCatalog): AiRequiredItem[] =>
  picks.flatMap((pick) => {
    const code = catalog.codeOf(pick.catalogId);
    return code ? [{ code, count: pick.count }] : [];
  });

/** 清单 → 回显文字，例如「双人床 1.8m、床头柜 ×2」。 */
export const pickNames = (picks: AiFurniturePick[], catalog: AiCatalog): string[] =>
  picks.map((pick) => `${catalog.byId.get(pick.catalogId)?.name ?? "未知家具"}${pick.count > 1 ? ` ×${pick.count}` : ""}`);
