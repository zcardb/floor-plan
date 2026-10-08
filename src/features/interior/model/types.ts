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
  name: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
  color: string;
  catalogId?: string;
}
export interface CostSettings {
  floorPrices?: Record<string, number | null>;
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
  name: string;
  w: number;
  d: number;
  color: string;
  category: string;
}
export const uid = () => crypto.randomUUID();
