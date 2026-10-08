import { library } from "../data/catalog";
import { floorMaterialOf, isFloorKey } from "./floorMaterials";
import { area, length, perim } from "./geometry";
import { projectProcurement } from "./materialProcurement";
import { effectiveCostDesign, type AccountCostSettings } from './costDefaults';
import type {
  CostSettings,
  Design,
  Furniture,
  Opening,
  Point,
  Room,
} from "./types";
import { openingName, openingPriceKey, roofSurfaceArea, surfaceMaterialOf, wallMaterialOf } from "./hardMaterials";
export { wallMaterials } from "./hardMaterials";
export type PriceGroup =
  | "floorPrices"
  | "wallPrices"
  | "furniturePrices"
  | "openingPrices"
  | "roofPrices"
  | "ceilingPrices"
  | "constructionPrices";
export interface CostRow {
  key: string;
  name: string;
  group: PriceGroup;
  quantity: number;
  unit: "m²" | "件" | "张" | "箱";
  price: number | null;
  subtotal: number;
  reference?: boolean;
}
export const validPrice = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100000000;
export function furnitureKey(f: Furniture): string {
  if (f.catalogId) return f.catalogId;
  const matches = library.filter((l) => l.type === f.type && l.name === f.name);
  const item =
    matches.length === 1
      ? matches[0]
      : library.find((l) => l.type === f.type && l.w === f.w && l.d === f.d);
  return item?.catalogId || `legacy:${f.type}:${f.name}:${f.w}x${f.d}`;
}
export function normalizeFurniture(f: Furniture): Furniture {
  return f.catalogId ? f : { ...f, catalogId: furnitureKey(f) };
}
export function priceOf(
  d: Design,
  group: PriceGroup,
  key: string,
  defaults?: AccountCostSettings,
): number | null {
  if (defaults) d = effectiveCostDesign(d, defaults);
  const override = (
    d.costSettings?.[group] as Record<string, number | null> | undefined
  )?.[key];
  if (override !== undefined) return override;
  if (group === "floorPrices") return isFloorKey(d, key) ? floorMaterialOf(d, key).price : null;
  if (group === "furniturePrices")
    return d.customCatalog?.find((i) => i.catalogId === key)?.price ?? null;
  if (group === "wallPrices")
    return d.customWalls?.find((w) => w.key === key)?.price ?? null;
  if (group === "openingPrices")
    return d.customOpenings?.find((o) => o.key === key)?.price ?? null;
  if (group === "roofPrices")
    return d.customRoofs?.find((o) => o.key === key)?.price ?? null;
  if (group === "ceilingPrices")
    return d.customCeilings?.find((o) => o.key === key)?.price ?? null;
  return null;
}
export function setPrice(
  d: Design,
  group: PriceGroup,
  key: string,
  value: number | null,
  defaults?: AccountCostSettings,
): Design {
  if (value !== null && !validPrice(value))
    throw new Error("价格必须是 0～100,000,000 的有效金额");
  return {
    ...d,
    costSettings: {
      ...d.costSettings,
      [group]: { ...d.costSettings?.[group], [key]: value },
      ...(group === 'floorPrices' ? { procurement: { ...d.costSettings?.procurement, [key]: effectiveCostDesign(d, defaults).costSettings?.procurement?.[key] || {unit:'m²',waste:5} } } : {}),
    },
  };
}
export function openingDimensions(o: Opening, d: Design) {
  const sill = o.kind === "window" ? (o.sill ?? 800) : 0,
    height = Math.min(
      o.height ?? (o.kind === "door" ? 2100 : 1600),
      Math.max(0, d.height - sill),
    );
  return { sill, height, area: (o.width * height) / 1e6 };
}
function overlapOnBoundary(
  a: Point,
  b: Point,
  c: Point,
  e: Point,
  tolerance: number,
) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!L) return 0;
  const dx = (b[0] - a[0]) / L,
    dy = (b[1] - a[1]) / L;
  const distance = (p: Point) =>
    Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx);
  if (distance(c) > tolerance || distance(e) > tolerance) return 0;
  const p = (v: Point) => (v[0] - a[0]) * dx + (v[1] - a[1]) * dy;
  return Math.max(
    0,
    Math.min(L, Math.max(p(c), p(e))) - Math.max(0, Math.min(p(c), p(e))),
  );
}
/**
 * 开口落在该房间边界上的宽度（mm）；不贴墙时返回 0。
 * 墙面扣减与门窗费用分摊共用同一套几何判定。
 */
export function openingRoomOverlap(room: Room, o: Opening, d: Design): number {
  const w = d.walls.find((w) => w.id === o.wallId);
  if (!w || d.demolished.includes(w.id)) return 0;
  const L = length(w);
  if (!L) return 0;
  const dx = (w.b[0] - w.a[0]) / L,
    dy = (w.b[1] - w.a[1]) / L,
    p: Point = [w.a[0] + dx * o.offset, w.a[1] + dy * o.offset],
    a: Point = [p[0] - (dx * o.width) / 2, p[1] - (dy * o.width) / 2],
    b: Point = [p[0] + (dx * o.width) / 2, p[1] + (dy * o.width) / 2];
  let matched = 0;
  for (const ring of room.rings)
    for (let i = 0; i < ring.length; i++)
      matched = Math.max(
        matched,
        overlapOnBoundary(
          ring[i],
          ring[(i + 1) % ring.length],
          a,
          b,
          w.thickness / 2 + 2,
        ),
      );
  return Math.min(o.width, matched);
}
export function wallSurfaceArea(room: Room, d: Design): number {
  let deduction = 0;
  for (const o of d.openings)
    deduction +=
      (openingRoomOverlap(room, o, d) * openingDimensions(o, d).height) / 1e6;
  return Math.max(0, (perim(room) * d.height) / 1000 - deduction);
}
/** 与该开口相邻、需要共同承担其费用的房间 id。 */
export function openingRoomIds(d: Design, o: Opening): string[] {
  return d.rooms
    .filter((r) => openingRoomOverlap(r, o, d) > 1)
    .map((r) => r.id);
}
export function calculateCosts(d: Design, defaults?: AccountCostSettings) {
  if (defaults) d = effectiveCostDesign(d, defaults);
  const soft: CostRow[] = [],
    hard: CostRow[] = [];
  const add = (
    rows: CostRow[],
    group: PriceGroup,
    key: string,
    name: string,
    quantity: number,
    unit: CostRow["unit"],
    reference = false,
  ) => {
    const old = rows.find((r) => r.key === key && r.group === group),
      price = priceOf(d, group, key);
    if (old) {
      old.quantity += quantity;
      old.subtotal = old.quantity * (price ?? 0);
    } else
      rows.push({
        key,
        group,
        name,
        quantity,
        unit,
        price,
        subtotal: quantity * (price ?? 0),
        reference,
      });
  };
  for (const f of d.furniture)
    add(
      soft,
      "furniturePrices",
      furnitureKey(f),
      [...(d.customCatalog || []), ...library].find(
        (l) => l.catalogId === furnitureKey(f),
      )?.name || f.name,
      1,
      "件",
    );
  for (const r of d.rooms) {
    add(
      hard,
      "floorPrices",
      r.mat,
      floorMaterialOf(d, r.mat).name,
      area(r) * 1.05,
      "m²",
      d.costSettings?.floorPrices?.[r.mat] === undefined,
    );
    if (r.counted !== false) {
      const key = r.wallMat || "paint";
      add(
        hard,
        "wallPrices",
        key,
        wallMaterialOf(d, key).name,
        wallSurfaceArea(r, d),
        "m²",
      );
    }
    if (r.roofMat)
      add(hard, "roofPrices", r.roofMat, surfaceMaterialOf(d, "roof", r.roofMat)?.name || "屋面", roofSurfaceArea(r), "m²");
    if (r.roofMat && r.ceilingMat)
      add(hard, "ceilingPrices", r.ceilingMat, surfaceMaterialOf(d, "ceiling", r.ceilingMat)?.name || "吊顶", area(r), "m²");
  }
  for (const o of d.openings) {
    if (d.demolished.includes(o.wallId)) continue;
    add(
      hard,
      "openingPrices",
      openingPriceKey(o),
      openingName(d, o),
      openingDimensions(o, d).area,
      "m²",
    );
  }
  for (const w of d.walls) {
    if (d.demolished.includes(w.id))
      add(
        hard,
        "constructionPrices",
        "demolish",
        "墙体拆除",
        (length(w) * d.height) / 1e6,
        "m²",
      );
    else if (d.template === "blank" && w.kind === "partition")
      add(
        hard,
        "constructionPrices",
        "build",
        "新建隔墙",
        (length(w) * d.height) / 1e6,
        "m²",
      );
  }
  for (const row of hard.filter((r) => r.group === "floorPrices")) {
    const purchase = projectProcurement(d, row.key);
    row.quantity = purchase.quantity;
    row.unit = purchase.unit;
    row.subtotal = purchase.quantity * (row.price ?? 0);
  }
  const labor = d.costSettings?.labor || [],
    softTotal = soft.reduce((s, r) => s + r.subtotal, 0),
    hardTotal =
      hard.reduce((s, r) => s + r.subtotal, 0) +
      labor.reduce((s, r) => s + r.amount, 0);
  return {
    soft,
    hard,
    labor,
    softTotal,
    hardTotal,
    total: softTotal + hardTotal,
    unpriced: [...soft, ...hard].filter(
      (r) => r.price === null && r.quantity > 0,
    ).length,
  };
}
