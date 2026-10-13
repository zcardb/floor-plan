import { area, length } from "./geometry";
import type { CustomOpening, CustomWall, Design, Opening, OpeningKind, Room } from "./types";

export const WALL_CATEGORY = "墙面";
export const OPENING_CATEGORY = "门窗";
export const ROOF_CATEGORY = "屋面";
export const CEILING_CATEGORY = "吊顶";
/** 硬装分类，顺序即管理页与新建弹窗中的展示顺序。 */
export const HARD_CATEGORIES = ["地面", WALL_CATEGORY, OPENING_CATEGORY, ROOF_CATEGORY, CEILING_CATEGORY];

export interface WallMaterial {
  name: string;
  color: string;
  price?: number | null;
  custom?: boolean;
}
export const wallMaterials: Record<string, WallMaterial> = {
  paint: { name: "乳胶漆", color: "#eee9de" },
  wallpaper: { name: "墙纸", color: "#e1d4be" },
  walltile: { name: "墙砖", color: "#c7d0cc" },
};
/** 内置屋面材料：自建房、别墅常见做法，仅作参考，不带默认单价。 */
export const roofMaterials: Record<string, WallMaterial> = {
  glazedTile: { name: "琉璃瓦", color: "#3f6b8c" },
  cementTile: { name: "水泥瓦", color: "#8b9096" },
  asphaltShingle: { name: "沥青瓦", color: "#5a4a43" },
  resinTile: { name: "树脂瓦", color: "#a3412f" },
  slateTile: { name: "石板瓦", color: "#4a535c" },
  concreteFlat: { name: "现浇混凝土平屋面（含防水保温）", color: "#b8b4aa" },
  steelSheet: { name: "彩钢瓦", color: "#3d6f9e" },
  polycarbonate: { name: "阳光板", color: "#cfe2e8" },
};
/** 内置吊顶材料，仅作参考，不带默认单价。 */
export const ceilingMaterials: Record<string, WallMaterial> = {
  gypsum: { name: "石膏板吊顶", color: "#f3f1ec" },
  aluminum: { name: "铝扣板吊顶", color: "#e4e7ea" },
  integrated: { name: "集成吊顶", color: "#ebe9e3" },
};

/** 墙面 / 屋面 / 吊顶共用「名称 + 颜色 + 单价/m²」结构，差异集中在这里。 */
const surfaces = {
  wall: { field: "customWalls", builtin: wallMaterials, category: WALL_CATEGORY },
  roof: { field: "customRoofs", builtin: roofMaterials, category: ROOF_CATEGORY },
  ceiling: { field: "customCeilings", builtin: ceilingMaterials, category: CEILING_CATEGORY },
} as const;
export type SurfaceKind = keyof typeof surfaces;
type SurfaceDesign = Pick<Design, "customWalls" | "customRoofs" | "customCeilings">;
export const surfaceCategory = (kind: SurfaceKind) => surfaces[kind].category;
export const surfaceKindOfCategory = (category: string): SurfaceKind | undefined =>
  (Object.keys(surfaces) as SurfaceKind[]).find((kind) => surfaces[kind].category === category);
export const ROOF_SLOPE_MAX = 60;
/** 屋面斜面面积：同坡度的平/单坡/双坡/四坡都等于投影面积 ÷ cos(坡度)。 */
export const roofSurfaceArea = (room: Room) => area(room) / Math.cos(((room.roofSlope ?? 0) * Math.PI) / 180);
const OPENING_KINDS: Record<OpeningKind, { label: string; standard: string; width: number; height: number }> = {
  door: { label: "门", standard: "标准门", width: 900, height: 2100 },
  window: { label: "窗", standard: "标准窗", width: 1200, height: 1600 },
  passage: { label: "垭口", standard: "标准垭口", width: 1200, height: 2100 },
};
export const openingKinds: { value: OpeningKind; label: string }[] =
  (Object.keys(OPENING_KINDS) as OpeningKind[]).map((value) => ({ value, label: OPENING_KINDS[value].label }));
export const isOpeningKind = (v: unknown): v is OpeningKind =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(OPENING_KINDS, v);
export const openingKindLabel = (kind: OpeningKind) => OPENING_KINDS[kind].label;
export const standardOpeningName = (kind: OpeningKind) => OPENING_KINDS[kind].standard;
export const defaultOpeningSize = (kind: OpeningKind) => ({ width: OPENING_KINDS[kind].width, height: OPENING_KINDS[kind].height });
/** 离地高度：只有窗有窗台，门与垭口恒为 0。 */
export const openingSill = (o: Pick<Opening, "kind" | "sill">) => (o.kind === "window" ? (o.sill ?? 800) : 0);
export const openingHeight = (o: Pick<Opening, "kind" | "height">) => o.height ?? defaultOpeningSize(o.kind).height;

const CUSTOM_KEY = /^custom-[0-9a-f-]{36}$/i;
const validName = (v: unknown) => typeof v === "string" && !!v.trim() && v.length <= 100;
const validPriceValue = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e8);
const within = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export function validCustomWall(w: unknown): w is CustomWall {
  if (!w || typeof w !== "object") return false;
  const v = w as CustomWall;
  return typeof v.key === "string" && CUSTOM_KEY.test(v.key) && validName(v.name) &&
    typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color) && validPriceValue(v.price);
}
export function validCustomOpening(o: unknown): o is CustomOpening {
  if (!o || typeof o !== "object") return false;
  const v = o as CustomOpening;
  return typeof v.key === "string" && CUSTOM_KEY.test(v.key) && validName(v.name) &&
    isOpeningKind(v.kind) && within(v.width, 100, 10000) &&
    within(v.height, 100, 8000) && validPriceValue(v.price);
}

export const customWallMaterial = (w: CustomWall): WallMaterial => ({ name: w.name, color: w.color, price: w.price, custom: true });
export function surfaceMaterialOf(d: SurfaceDesign, kind: SurfaceKind, key: string): WallMaterial | undefined {
  const custom = d[surfaces[kind].field]?.find((w) => w.key === key);
  return custom ? customWallMaterial(custom) : surfaces[kind].builtin[key];
}
export const isSurfaceKey = (d: SurfaceDesign, kind: SurfaceKind, key: string) =>
  Object.prototype.hasOwnProperty.call(surfaces[kind].builtin, key) || !!d[surfaces[kind].field]?.some((w) => w.key === key);
export function wallMaterialsOf(d: Pick<Design, "customWalls">): Record<string, WallMaterial> {
  return { ...wallMaterials, ...Object.fromEntries((d.customWalls || []).map((w) => [w.key, customWallMaterial(w)])) };
}
export function wallMaterialOf(d: Pick<Design, "customWalls">, key: string): WallMaterial {
  return surfaceMaterialOf(d, "wall", key) || { name: "墙面材料", color: wallMaterials.paint.color };
}
export const isWallKey = (d: Pick<Design, "customWalls">, key: string) => isSurfaceKey(d, "wall", key);

export const openingPriceKey = (o: Pick<Opening, "kind" | "variant">) => o.variant ?? o.kind;
export function openingName(d: Pick<Design, "customOpenings">, o: Pick<Opening, "kind" | "variant">): string {
  const custom = o.variant ? d.customOpenings?.find((c) => c.key === o.variant) : undefined;
  return custom?.name || openingKindLabel(o.kind);
}

export interface Pickable<T> { key: string; item: T; fromAccount: boolean }
function pickable<T extends { key: string }>(own: T[], account: T[]): Pickable<T>[] {
  const seen = new Set(own.map((i) => i.key));
  return [
    ...own.map((item) => ({ key: item.key, item, fromAccount: false })),
    ...account.filter((i) => !seen.has(i.key) && !!seen.add(i.key)).map((item) => ({ key: item.key, item, fromAccount: true })),
  ];
}
/** 房间可选墙面 / 屋面 / 吊顶：内置 + 项目自定义在前，账号库中尚未加入项目的追加在后。 */
export function pickableSurfaces(d: SurfaceDesign, kind: SurfaceKind, account: CustomWall[]) {
  return [
    ...Object.entries(surfaces[kind].builtin).map(([key, material]) => ({ key, name: material.name, material, fromAccount: false })),
    ...pickable(d[surfaces[kind].field] || [], account).map(({ key, item, fromAccount }) => ({ key, name: item.name, material: customWallMaterial(item), fromAccount })),
  ];
}
export const pickableWalls = (d: Pick<Design, "customWalls">, account: CustomWall[]) => pickableSurfaces(d, "wall", account);
/** 账号库材料首次使用时一并写入项目，保证一次撤销即可还原。 */
function withSurface(d: Design, kind: SurfaceKind, key: string, account: CustomWall[]): Design {
  if (isSurfaceKey(d, kind, key)) return d;
  const item = account.find((w) => w.key === key);
  if (!item) throw new Error(surfaces[kind].category + "材料不存在，请刷新后重试");
  const field = surfaces[kind].field;
  return { ...d, [field]: [...(d[field] || []), item] };
}
const patchRoom = (d: Design, roomId: string, patch: (r: Room) => Room): Design =>
  ({ ...d, rooms: d.rooms.map((r) => (r.id === roomId ? patch(r) : r)) });
const omit = (r: Room, ...keys: (keyof Room)[]): Room => { const next = { ...r }; for (const k of keys) delete next[k]; return next; };
/** 给房间设置墙面。 */
export function applyRoomWall(d: Design, roomId: string, key: string, account: CustomWall[]): Design {
  return patchRoom(withSurface(d, "wall", key, account), roomId, (r) => ({ ...r, wallMat: key }));
}
/** 给房间设置屋面；key 为 null 表示无屋面（同时清除坡度；吊顶独立保留）。 */
export function applyRoomRoof(d: Design, roomId: string, key: string | null, account: CustomWall[]): Design {
  if (key === null) return patchRoom(d, roomId, (r) => omit(r, "roofMat", "roofSlope"));
  return patchRoom(withSurface(d, "roof", key, account), roomId, (r) => ({ ...r, roofMat: key }));
}
export function setRoomRoofSlope(d: Design, roomId: string, slope: number): Design {
  if (!Number.isFinite(slope) || slope < 0 || slope > ROOF_SLOPE_MAX) throw new Error(`坡度需在 0～${ROOF_SLOPE_MAX}° 之间`);
  return patchRoom(d, roomId, (r) => ({ ...r, roofSlope: slope }));
}
/** 给房间设置吊顶；key 为 null 表示原顶。吊顶与屋面相互独立。 */
export function applyRoomCeiling(d: Design, roomId: string, key: string | null, account: CustomWall[]): Design {
  if (key === null) return patchRoom(d, roomId, (r) => omit(r, "ceilingMat"));
  return patchRoom(withSurface(d, "ceiling", key, account), roomId, (r) => ({ ...r, ceilingMat: key }));
}
/** 某类门窗可选款式（不含标准门/窗）。 */
export function pickableOpenings(d: Pick<Design, "customOpenings">, account: CustomOpening[], kind: Opening["kind"]) {
  return pickable(d.customOpenings || [], account).filter((p) => p.item.kind === kind);
}

/**
 * 切换门窗款式。variant 为空表示标准门/窗。
 * 宽度仅在墙段放得下且不与同墙其他门窗重叠时同步，否则保留原宽并通过 widthKept 告知。
 */
export function applyOpeningVariant(d: Design, openingId: string, variant: string | null, account: CustomOpening[]): { design: Design; widthKept: boolean } {
  const o = d.openings.find((x) => x.id === openingId);
  if (!o) throw new Error("门窗不存在，请刷新后重试");
  let next = d;
  let style: CustomOpening | undefined;
  if (variant) {
    style = d.customOpenings?.find((c) => c.key === variant);
    if (!style) {
      style = account.find((c) => c.key === variant);
      if (!style) throw new Error("门窗款式不存在，请刷新后重试");
      next = { ...d, customOpenings: [...(d.customOpenings || []), style] };
    }
    if (style.kind !== o.kind) throw new Error("款式类型与当前门窗不一致");
  }
  const size = style || defaultOpeningSize(o.kind);
  const wall = d.walls.find((w) => w.id === o.wallId);
  const L = wall ? length(wall) : 0;
  const offset = Math.min(L - size.width / 2, Math.max(size.width / 2, o.offset));
  const fits = !!wall && size.width <= L &&
    !d.openings.some((x) => x.id !== o.id && x.wallId === o.wallId && Math.abs(x.offset - offset) < (x.width + size.width) / 2);
  const updated: Opening = { ...o, height: size.height, ...(fits ? { width: size.width, offset } : {}) };
  if (variant) updated.variant = variant; else delete updated.variant;
  return { design: { ...next, openings: next.openings.map((x) => (x.id === o.id ? updated : x)) }, widthKept: !fits && o.width !== size.width };
}
