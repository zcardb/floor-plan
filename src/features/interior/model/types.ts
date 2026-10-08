import type { FurnitureOutline } from './furnitureAppearance';
export type Point = [number, number];
export type WallKind = "bearing" | "exterior" | "partition" | "low";
export interface Wall {
  id: string;
  a: Point;
  b: Point;
  thickness: number;
  kind: WallKind;
  color?: string;
}
export interface Opening {
  id: string;
  wallId: string;
  kind: "door" | "window";
  offset: number;
  width: number;
  open?: boolean;
  height?: number;
  sill?: number;
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
  openingPrices?: Partial<Record<"door" | "window", number | null>>;
  constructionPrices?: Partial<Record<"build" | "demolish", number | null>>;
  labor?: { id: string; name: string; amount: number }[];
}
export interface Measure {
  id: string;
  a: Point;
  b: Point;
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
  measures: Measure[];
  costSettings?: CostSettings;
  customCatalog?: LibraryItem[];
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
export type Tool =
  "select" | "measure" | "demolish" | "wall" | "door" | "window";
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
