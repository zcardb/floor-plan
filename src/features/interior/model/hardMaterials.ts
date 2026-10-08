import { length } from "./geometry";
import type { CustomOpening, CustomWall, Design, Opening } from "./types";

/** 硬装分类，顺序即管理页与新建弹窗中的展示顺序。 */
export const HARD_CATEGORIES = ["地面", "墙面", "门窗"];
export const WALL_CATEGORY = "墙面";
export const OPENING_CATEGORY = "门窗";

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
export const openingKinds: { value: Opening["kind"]; label: string }[] = [
  { value: "door", label: "门" },
  { value: "window", label: "窗" },
];
export const defaultOpeningSize = (kind: Opening["kind"]) =>
  kind === "door" ? { width: 900, height: 2100 } : { width: 1200, height: 1600 };

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
    (v.kind === "door" || v.kind === "window") && within(v.width, 100, 10000) &&
    within(v.height, 100, 8000) && validPriceValue(v.price);
}

export const customWallMaterial = (w: CustomWall): WallMaterial => ({ name: w.name, color: w.color, price: w.price, custom: true });
export function wallMaterialsOf(d: Pick<Design, "customWalls">): Record<string, WallMaterial> {
  return { ...wallMaterials, ...Object.fromEntries((d.customWalls || []).map((w) => [w.key, customWallMaterial(w)])) };
}
export function wallMaterialOf(d: Pick<Design, "customWalls">, key: string): WallMaterial {
  const custom = d.customWalls?.find((w) => w.key === key);
  return custom ? customWallMaterial(custom) : wallMaterials[key] || { name: "墙面材料", color: wallMaterials.paint.color };
}
export const isWallKey = (d: Pick<Design, "customWalls">, key: string) =>
  Object.prototype.hasOwnProperty.call(wallMaterials, key) || !!d.customWalls?.some((w) => w.key === key);

export const openingPriceKey = (o: Pick<Opening, "kind" | "variant">) => o.variant ?? o.kind;
export function openingName(d: Pick<Design, "customOpenings">, o: Pick<Opening, "kind" | "variant">): string {
  const custom = o.variant ? d.customOpenings?.find((c) => c.key === o.variant) : undefined;
  return custom?.name || (o.kind === "door" ? "门" : "窗");
}

export interface Pickable<T> { key: string; item: T; fromAccount: boolean }
function pickable<T extends { key: string }>(own: T[], account: T[]): Pickable<T>[] {
  const seen = new Set(own.map((i) => i.key));
  return [
    ...own.map((item) => ({ key: item.key, item, fromAccount: false })),
    ...account.filter((i) => !seen.has(i.key) && !!seen.add(i.key)).map((item) => ({ key: item.key, item, fromAccount: true })),
  ];
}
/** 房间可选墙面：内置 + 项目自定义在前，账号库中尚未加入项目的追加在后。 */
export function pickableWalls(d: Pick<Design, "customWalls">, account: CustomWall[]) {
  return [
    ...Object.entries(wallMaterials).map(([key, m]) => ({ key, name: m.name, fromAccount: false })),
    ...pickable(d.customWalls || [], account).map(({ key, item, fromAccount }) => ({ key, name: item.name, fromAccount })),
  ];
}
/** 给房间设置墙面；账号库墙面首次使用时一并写入项目，保证一次撤销即可还原。 */
export function applyRoomWall(d: Design, roomId: string, key: string, account: CustomWall[]): Design {
  let next = d;
  if (!isWallKey(d, key)) {
    const wall = account.find((w) => w.key === key);
    if (!wall) throw new Error("墙面材料不存在，请刷新后重试");
    next = { ...d, customWalls: [...(d.customWalls || []), wall] };
  }
  return { ...next, rooms: next.rooms.map((r) => (r.id === roomId ? { ...r, wallMat: key } : r)) };
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
