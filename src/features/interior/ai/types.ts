import type { Side } from "../data/floorplanBuilder";
import type { LibraryItem, OpeningKind } from "../model/types";

/** 发给模型的目录条目：模型只引用 code；catalogId 只给后端落库用，不进提示词。 */
export interface AiCatalogEntry {
  code: string;
  catalogId: string;
  name: string;
  category: string;
  type: string;
  w: number;
  d: number;
}

/** 本次请求的家具目录：条目 + 代号 → 素材的映射。 */
export interface AiCatalog {
  entries: AiCatalogEntry[];
  byCode: Map<string, LibraryItem>;
  byId: Map<string, LibraryItem>;
  codeOf: (catalogId: string) => string | undefined;
}

/** 指定家具：代号 + 数量（数量必须完全一致）。 */
export interface AiRequiredItem {
  code: string;
  count: number;
}

/** 整套户型快照：房间布局时随请求发送，让模型看到房间之间的关系。 */
export interface AiPlanSnapshot {
  width: number;
  depth: number;
  walls: { a: [number, number]; b: [number, number]; thickness: number; kind: string }[];
  openings: { kind: OpeningKind; at: [number, number]; width: number; rooms: string[] }[];
  rooms: { id: string; name: string; area: number; ring: [number, number][] }[];
  furniture: { room: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
}

export type AiEdge = Side;

/** 目标房间：摆放分区 zone 为房间净空外接矩形（绝对坐标 mm）。 */
export interface AiRoomContext {
  roomId: string;
  name: string;
  area: number;
  zone: [number, number, number, number];
  openings: { kind: OpeningKind; edge: AiEdge; along: number; width: number }[];
}

/** 模型输出的家具（房间布局与整户家具共用）。 */
export interface AiPlacedItem {
  code: string;
  back: Side;
  along?: number;
  gap?: number;
}

export interface AiCandidate<T> {
  id: string;
  index: number;
  summary: string;
  result: T;
  /** 方案能落地但有需要微调的地方（尺寸或间距）。 */
  warnings?: number;
}

/** 单个候选的生成状态：先完成的先出现。 */
export type AiSlot<T> =
  | { status: "pending" }
  | { status: "failed"; error: string }
  | { status: "ready"; candidate: AiCandidate<T> };

/** 指定家具清单的一项：同一件家具合并计数。 */
export interface AiFurniturePick {
  catalogId: string;
  count: number;
  /** 用户改过的尺寸（mm）；不填用目录尺寸。 */
  size?: { w: number; d: number };
}
