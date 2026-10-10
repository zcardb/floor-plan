import type { FurnitureOutline } from './furnitureAppearance';
import type { FurnitureModel3d } from './furniture3d';
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
export type OpeningKind = "door" | "window" | "passage";
export interface Opening {
  id: string;
  wallId: string;
  /** passage = 垭口：无门扇的落地洞口，只有宽、高与沿墙位置（离地高度恒为 0）。 */
  kind: OpeningKind;
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
  /** 屋面材料 key；为空表示无屋面，不计费。 */
  roofMat?: string;
  /** 屋面坡度（°，0–60），0 为平顶。 */
  roofSlope?: number;
  /** 吊顶材料 key；为空表示原顶，不计费。 */
  ceilingMat?: string;
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
  /** AI 生成的简易 3D 模型（画布 3D 与详情预览共用）。 */
  model3d?: FurnitureModel3d;
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
  roofPrices?: Record<string, number | null>;
  ceilingPrices?: Record<string, number | null>;
  constructionPrices?: Partial<Record<"build" | "demolish", number | null>>;
  labor?: { id: string; name: string; amount: number }[];
}
export interface Design {
  version: 2;
  template: "reference" | "blank";
  /** 内置户型模板 id（见 data/templatePresets.ts）；空白户型与旧数据没有该字段。 */
  templateId?: string;
  width: number;
  depth: number;
  thickness: number;
  height: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: Furniture[];
  demolished: string[];
  /** @deprecated 旧版「复制/新建才解锁结构」的标记；墙体可编辑性现只看承重，仅为兼容已保存数据保留。 */
  structureUnlocked?: boolean;
  dimensionSettings?: { visible?: boolean; top?: number; bottom?: number; left?: number; right?: number };
  /** 北方相对图纸正上方的顺时针角度（0–359°）；旧项目没有该字段，视为上北。 */
  northAngle?: number;
  /** 拖动门窗时的步进（mm）；旧项目没有该字段，默认 50。 */
  dragStep?: number;
  costSettings?: CostSettings;
  customCatalog?: LibraryItem[];
  customFloors?: CustomFloor[];
  customWalls?: CustomWall[];
  customOpenings?: CustomOpening[];
  customRoofs?: CustomWall[];
  customCeilings?: CustomWall[];
}
/** 自定义墙面 / 屋面 / 吊顶材料（名称 + 颜色），单价按 m²。 */
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
  kind: OpeningKind;
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
  /** 系统自带的本机默认方案：不可重命名、不可删除，只能复制。 */
  system?: boolean;
  /** 内置户型模板：只读预览，不可编辑、重命名、复制或删除。 */
  builtin?: boolean;
  /** 内置模板对应的预设 id（builtin 为真时有值）。 */
  templateId?: string;
}
export type Selection = {
  kind: "furniture" | "room" | "wall" | "opening";
  id: string;
} | {
  /** 框选得到的一组家具（≥2 件）。 */
  kind: "group";
  ids: string[];
} | null;
/** 选择的稳定标识（成组选择为组内 id 拼接），用于 key 与依赖比较。 */
export const selectionKey = (s: Selection) => !s ? '' : s.kind === 'group' ? `group:${s.ids.join(',')}` : `${s.kind}:${s.id}`;
export type Tool = "select" | "wall" | OpeningKind;
export const isOpeningTool = (tool: Tool): tool is OpeningKind => tool === "door" || tool === "window" || tool === "passage";
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
  /** AI 生成的 3D 透视效果图（家具详情的 3D 视角）。 */
  image3dUrl?: string;
  /** AI 生成的简易 3D 模型（画布 3D 与详情预览共用）。 */
  model3d?: FurnitureModel3d;
  price?: number | null;
}
export const uid = () => crypto.randomUUID();
