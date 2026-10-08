import type { FurnitureOutline } from './furnitureAppearance';
export type Point = [number, number];
export type WallKind = "bearing" | "exterior" | "partition" | "low";
export interface Wall {
  id: string;
  a: Point;
  b: Point;
  thickness: number;
  kind: WallKind;
  loadBearing?: boolean;
  exteriorRootId?: string;
  color?: string;
}
export interface Opening {
  id: string;
  wallId: string;
  kind: "door" | "window";
  offset: number;
  width: number;
  open?: boolean;
  hinge?: 'start' | 'end';
  swingSide?: -1 | 1;
  height?: number;
  sill?: number;
  /** 自定义门窗款式 key（见 Design.customOpenings）；为空时是标准门/窗。 */
  variant?: string;
}
export interface Room {
  id: string;
  name: string;
  rings: Point[][];
  mat: string;
  counted?: boolean;
  wallMat?: string;
}
export interface Furniture {
  id: string;
  type: string;
  shape?: FurnitureOutline;
  name: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
  color: string;
  catalogId?: string;
  height?: number;
  imageUrl?: string;
}
export interface MaterialProcurement {
  length?: number;
  width?: number;
  waste: number;
  perBox?: number;
  unit: "m²" | "张" | "箱";
}
export interface CostSettings {
  floorPrices?: Record<string, number | null>;
  procurement?: Record<string, MaterialProcurement>;
  wallPrices?: Record<string, number | null>;
  furniturePrices?: Record<string, number | null>;
  /** key 为 door / window 或自定义门窗款式 key。 */
  openingPrices?: Record<string, number | null>;
  constructionPrices?: Partial<Record<"build" | "demolish", number | null>>;
  labor?: { id: string; name: string; amount: number }[];
}
export interface Design {
  version: 2;
  template: "reference" | "blank";
  width: number;
  depth: number;
  thickness: number;
  height: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: Furniture[];
  demolished: string[];
  /** 复制/新建的项目可以自由调整墙体结构尺寸；旧项目没有该字段，保持结构锁定。 */
  structureUnlocked?: boolean;
  dimensionSettings?: { visible?: boolean; top?: number; bottom?: number; left?: number; right?: number };
  costSettings?: CostSettings;
  customCatalog?: LibraryItem[];
  customFloors?: CustomFloor[];
  customWalls?: CustomWall[];
  customOpenings?: CustomOpening[];
}
/** 自定义墙面材料，单价按 m²。 */
export interface CustomWall {
  key: string;
  name: string;
  color: string;
  price: number | null;
}
/** 自定义门窗款式，单价按开口面积 m²。 */
export interface CustomOpening {
  key: string;
  name: string;
  kind: "door" | "window";
  width: number;
  height: number;
  price: number | null;
}
export type FloorPattern = "plank" | "tile" | "seamless";
export interface CustomFloor {
  key: string;
  name: string;
  pattern: FloorPattern;
  length?: number;
  width?: number;
  color: string;
  price: number | null;
}
export interface Project {
  id: string;
  name: string;
  state: Design;
  updatedAt: string;
  revision: number;
  cloud?: boolean;
}
export type Selection = {
  kind: "furniture" | "room" | "wall" | "opening";
  id: string;
} | null;
export type Tool = "select" | "wall" | "door" | "window";
export interface Layers {
  grid: boolean;
  dims: boolean;
  labels: boolean;
  furn: boolean;
  bearing: boolean;
  snap: boolean;
}
export interface Material {
  name: string;
  price: number;
  color: string;
}
export interface LibraryItem {
  catalogId?: string;
  type: string;
  shape?: FurnitureOutline;
  name: string;
  w: number;
  d: number;
  color: string;
  category: string;
  height?: number;
  imageUrl?: string;
  price?: number | null;
}
export const uid = () => crypto.randomUUID();
