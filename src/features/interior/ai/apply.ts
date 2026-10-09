import { buildPlan, placeFurniture, type FurnitureSpec, type PlanSpec } from "../data/floorplanBuilder";
import { AI_TEMPLATE_ID } from "../data/templates";
import { furnitureKey } from "../model/costs";
import { validateDesign } from "../model/validation";
import { mergeAllSplits } from "../model/wallBulk";
import type { Design, Furniture, LibraryItem } from "../model/types";
import { isBuiltinItem } from "./catalog";
import { furnitureInRoom, roomZone } from "./context";
import { catalogResolver } from "./sanitize";
import type { AiCatalog } from "./types";

/** 把用到的账号 / 项目家具登记进项目目录，报价与导出沿用它的名称与单价。 */
function registerCatalog(design: Design, furniture: Furniture[], catalog: AiCatalog): LibraryItem[] | undefined {
  const known = new Set((design.customCatalog ?? []).map((item) => item.catalogId));
  const added: LibraryItem[] = [];
  for (const f of furniture) {
    const item = f.catalogId ? catalog.byId.get(f.catalogId) : undefined;
    if (!item || isBuiltinItem(item) || known.has(item.catalogId)) continue;
    known.add(item.catalogId);
    added.push(item);
  }
  return added.length ? [...(design.customCatalog ?? []), ...added] : design.customCatalog;
}

/** 整户户型候选 → 可直接新建项目的方案（标记为 AI 户型，结构可编辑）。 */
export function planToDesign(spec: PlanSpec, catalog: AiCatalog): Design {
  // 生成时每个门窗各占一段满宽墙，门窗无法沿墙拖动：默认执行一次「清空分割」。
  const built = mergeAllSplits(buildPlan(spec, catalogResolver(catalog))).design;
  const design: Design = { ...built, templateId: AI_TEMPLATE_ID, structureUnlocked: true };
  return validateDesign({ ...design, customCatalog: registerCatalog(design, design.furniture, catalog) });
}

/**
 * 房间布局候选落地：清掉房间里原有家具，按简写放入新家具。
 * 与原有家具同款（同 catalogId）的沿用其外观（颜色、外形、图片、高度）；只改这个房间，墙体门窗与其他房间不动。
 * 不做 pushOut 二次修正：简写已经贴墙定位，再推会把贴墙家具推离墙面。
 */
export function applyRoomLayout(design: Design, roomId: string, specs: FurnitureSpec[], catalog: AiCatalog): Design {
  const room = design.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error("房间已不存在，请重新选择");
  const before = furnitureInRoom(design, room);
  const removed = new Set(before.map((f) => f.id));
  const looks = new Map<string, Furniture>();
  for (const f of before) if (!looks.has(furnitureKey(f))) looks.set(furnitureKey(f), f);
  const placed = placeFurniture({ zone: roomZone(room), items: specs }, catalogResolver(catalog, design.customCatalog)).map((f) => {
    const look = looks.get(furnitureKey(f));
    return look
      ? {
          ...f,
          color: look.color,
          ...(look.shape ? { shape: look.shape } : {}),
          ...(look.imageUrl ? { imageUrl: look.imageUrl } : {}),
          ...(look.height ? { height: look.height } : {}),
        }
      : f;
  });
  const kept = design.furniture.filter((f) => !removed.has(f.id));
  const rugs = placed.filter((f) => f.type === "rug"), rest = placed.filter((f) => f.type !== "rug");
  return {
    ...design,
    customCatalog: registerCatalog(design, placed, catalog),
    furniture: [...rugs, ...kept, ...rest],
  };
}
