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
