import { buildPlan, placeFurniture, type Box, type FurnitureSpec, type PlanSpec } from '../data/floorplanBuilder';
import { library } from '../data/catalog';
import { bbox, inRoom } from '../model/geometry';
import { uid, type Design, type Furniture, type LibraryItem, type Room } from '../model/types';
import type { AiCatalog } from './catalog';
import { catalogItemOf, resolveCode } from './catalog';
import type { AiPlacedItem } from './sanitize';
import { AI_TEMPLATE_ID } from '../data/templates';

/** 素材解析器：先查项目 / 账号目录，再查内置素材库。 */
export function resolveItem(catalog: AiCatalog, type: string, name?: string): LibraryItem | null {
  const values = [...catalog.byCode.values()];
  const entry =
    (name ? values.find((e) => e.type === type && e.name === name) : undefined) ??
    values.find((e) => e.type === type);
  return (entry ? catalogItemOf(entry) : undefined) ?? library.find((i) => i.type === type) ?? null;
}

/** 代号清单 → 家具简写；未知代号直接丢弃。 */
function specsOf(chips: AiPlacedItem[], catalog: AiCatalog): FurnitureSpec[] {
  const items: FurnitureSpec[] = [];
  for (const chip of chips) {
    const entry = resolveCode(catalog, chip.code);
    if (!entry) continue;
    items.push({
      type: entry.type,
      name: entry.name,
      w: chip.w ?? entry.w,
      d: chip.d ?? entry.d,
      back: chip.back,
      ...(chip.along === undefined ? {} : { along: chip.along }),
      ...(chip.gap === undefined ? {} : { gap: chip.gap }),
    });
  }
  return items;
}

/**
 * 房间布局：清空房间内家具后重新摆放。
 * 房间外家具、墙体与门窗完全不动；原本就在房间里的家具沿用原外观（颜色、外形、图片）。
 */
export function applyRoomFurniture(design: Design, room: Room, chips: AiPlacedItem[], catalog: AiCatalog): Design {
  const zone = bboxOfRoom(room);
  const specs = specsOf(chips, catalog);
  const placed = specs.length ? placeFurniture({ zone, items: specs }, (type, name) => resolveItem(catalog, type, name)) : [];
  // 取原件时复制一份候选池，避免改动传进来的设计。
  const pool = design.furniture.filter((f) => inRoom([f.cx, f.cy], room));
  const remaining = [...pool];
  const next = placed.map((f) => {
    const source = takeSource(remaining, f);
    return source ? { ...f, id: uid(), ...appearanceOf(source) } : f;
  });
  const outside = design.furniture.filter((f) => !inRoom([f.cx, f.cy], room));
  return withCatalog(design, { ...design, furniture: [...outside, ...next] }, catalog, chips);
}

/** 应用整户户型：只覆盖墙 / 开口 / 房间 / 家具，成本设置与自定义材质等其余字段保持不动。 */
export function applyPlanToDesign(design: Design, spec: PlanSpec, catalog: AiCatalog): Design {
  const built = buildPlan(spec, (type, name) => resolveItem(catalog, type, name));
  return withCatalog(design, {
    ...design,
    templateId: AI_TEMPLATE_ID,
    width: spec.width,
    depth: spec.depth,
    thickness: spec.thickness ?? design.thickness,
    height: spec.height ?? design.height,
    walls: built.walls,
    openings: built.openings,
    rooms: built.rooms,
    furniture: built.furniture,
    demolished: [],
    structureUnlocked: true,
  }, catalog, []);
}

/** 候选预览：复用真实落地逻辑，预览即应用后的结果。 */
export function previewRoomDesign(design: Design, room: Room, chips: AiPlacedItem[], catalog: AiCatalog): Design {
  return applyRoomFurniture(design, room, chips, catalog);
}

/** 结果里用到、项目目录还没有的账号家具要登记进来，报价与导出才能用上它。 */
function withCatalog(design: Design, next: Design, catalog: AiCatalog, chips: AiPlacedItem[]): Design {
  const additions: LibraryItem[] = [];
  for (const code of new Set(chips.map((c) => c.code))) {
    const entry = resolveCode(catalog, code);
    if (!entry?.source) continue;
    const used = next.furniture.some((f) => f.catalogId === entry.catalogId || (f.type === entry.type && f.name === entry.name));
    if (!used) continue;
    if (next.customCatalog?.some((i) => i.catalogId === entry.catalogId)) continue;
    if (library.some((i) => i.catalogId === entry.catalogId)) continue;
    additions.push(catalogItemOf(entry));
  }
  return additions.length ? { ...next, customCatalog: [...(next.customCatalog || []), ...additions] } : next;
}

/** 沿用原家具的外观，用户改过的样式不会因为 AI 重排被重置。 */
function appearanceOf(source: Furniture): Partial<Furniture> {
  return {
    ...(source.shape ? { shape: source.shape } : {}),
    ...(source.imageUrl ? { imageUrl: source.imageUrl } : {}),
    ...(source.height ? { height: source.height } : {}),
    ...(source.catalogId ? { catalogId: source.catalogId } : {}),
    color: source.color,
    name: source.name,
    type: source.type,
  };
}

/** 按家具类型从池子里取一件原件，取走的不再复用。 */
function takeSource(pool: Furniture[], placed: Furniture): Furniture | undefined {
  let index = pool.findIndex((f) => f.type === placed.type);
  if (index < 0 && placed.catalogId) index = pool.findIndex((f) => f.catalogId === placed.catalogId);
  return index < 0 ? undefined : pool.splice(index, 1)[0];
}

const bboxOfRoom = (room: Room): Box => {
  const b = bbox(room.rings[0] ?? []);
  return [Math.round(b.x), Math.round(b.y), Math.round(b.x2), Math.round(b.y2)];
};
