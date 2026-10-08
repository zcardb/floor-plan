import { materials } from "../data/catalog";
import type { CustomFloor, Design, FloorPattern } from "./types";

export interface FloorMaterial {
  name: string;
  price: number | null;
  color: string;
  pattern: FloorPattern;
  /** 单块长、宽（mm），整体浇筑时为空。 */
  length?: number;
  width?: number;
  custom?: boolean;
}

export const FLOOR_CATEGORY = "地面";
export const floorPatterns: { value: FloorPattern; label: string }[] = [
  { value: "plank", label: "木地板纹" },
  { value: "tile", label: "方砖 / 仿砖" },
  { value: "seamless", label: "整体浇筑 / 无缝" },
];
export const CUSTOM_FLOOR_KEY = /^custom-[0-9a-f-]{36}$/i;

const builtinShape: Record<string, Pick<FloorMaterial, "pattern" | "length" | "width">> = {
  wood: { pattern: "plank", length: 1200, width: 180 },
  walnut: { pattern: "plank", length: 1200, width: 180 },
  tile800: { pattern: "tile", length: 800, width: 800 },
  tile600: { pattern: "tile", length: 600, width: 600 },
  antislip: { pattern: "tile", length: 300, width: 300 },
  marble: { pattern: "tile", length: 1200, width: 1200 },
  terrazzo: { pattern: "tile", length: 1200, width: 1200 },
  carpet: { pattern: "tile", length: 1200, width: 1200 },
};

export const builtinFloors: Record<string, FloorMaterial> = Object.fromEntries(
  Object.entries(materials).map(([key, m]) => [key, { ...m, ...builtinShape[key] }]),
);

export const customFloorMaterial = (f: CustomFloor): FloorMaterial => ({
  name: f.name,
  price: f.price,
  color: f.color,
  pattern: f.pattern,
  ...(f.pattern === "seamless" ? {} : { length: f.length, width: f.width }),
  custom: true,
});

export function floorMaterialsOf(d: Pick<Design, "customFloors">): Record<string, FloorMaterial> {
  return {
    ...builtinFloors,
    ...Object.fromEntries((d.customFloors || []).map((f) => [f.key, customFloorMaterial(f)])),
  };
}

export function floorMaterialOf(d: Pick<Design, "customFloors">, key: string): FloorMaterial {
  const custom = d.customFloors?.find((f) => f.key === key);
  return custom ? customFloorMaterial(custom) : builtinFloors[key] || builtinFloors.wood;
}

export interface PickableFloor {
  key: string;
  material: FloorMaterial;
  /** 来自账号地面库、尚未加入当前项目；选择时会自动加入。 */
  fromAccount: boolean;
}

/** 房间可选地面：项目已有（内置 + 项目自定义）在前，账号库中尚未加入项目的追加在后。 */
export function pickableFloors(d: Pick<Design, "customFloors">, accountFloors: CustomFloor[]): PickableFloor[] {
  const own = floorMaterialsOf(d);
  const seen = new Set(Object.keys(own));
  const extra = accountFloors.filter((f) => !seen.has(f.key) && !!seen.add(f.key));
  return [
    ...Object.entries(own).map(([key, material]) => ({ key, material, fromAccount: false })),
    ...extra.map((f) => ({ key: f.key, material: customFloorMaterial(f), fromAccount: true })),
  ];
}

/** 给房间设置地面；账号库地面首次使用时一并写入项目 customFloors，保证一次撤销即可还原。 */
export function applyRoomFloor(d: Design, roomId: string, key: string, accountFloors: CustomFloor[]): Design {
  let next = d;
  if (!isFloorKey(d, key)) {
    const floor = accountFloors.find((f) => f.key === key);
    if (!floor) throw new Error("地面材质不存在，请刷新后重试");
    next = { ...d, customFloors: [...(d.customFloors || []), floor] };
  }
  return { ...next, rooms: next.rooms.map((r) => (r.id === roomId ? { ...r, mat: key } : r)) };
}

export const isFloorKey = (d: Pick<Design, "customFloors">, key: string) =>
  key in builtinFloors || !!d.customFloors?.some((f) => f.key === key);

export function validCustomFloor(f: unknown): f is CustomFloor {
  if (!f || typeof f !== "object") return false;
  const v = f as CustomFloor;
  const size = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 50 && n <= 20000;
  return (
    typeof v.key === "string" && CUSTOM_FLOOR_KEY.test(v.key) &&
    typeof v.name === "string" && !!v.name.trim() && v.name.length <= 100 &&
    floorPatterns.some((p) => p.value === v.pattern) &&
    (v.pattern === "seamless" ? v.length === undefined && v.width === undefined : size(v.length) && size(v.width)) &&
    typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color) &&
    (v.price === null || (typeof v.price === "number" && Number.isFinite(v.price) && v.price >= 0 && v.price <= 1e8))
  );
}
