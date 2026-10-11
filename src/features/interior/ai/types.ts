import type { Side } from "../data/floorplanBuilder";
import type { KeepOutKind, SpanKind } from "../model/layoutRules";
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
  /** 高度（mm）：目录没给时按类型取典型值，用于判断是否遮挡窗洞。 */
  height: number;
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

/** 房间轮廓的一条边及其背后的构造（相对 zone 左上角）：家具 back = side 时背靠这条边。 */
export interface AiRoomEdge {
  side: AiEdge;
  at: number;
  from: number;
  to: number;
  spans: { from: number; to: number; kind: SpanKind }[];
}

/**
 * 目标房间：摆放分区 zone 为房间净空外接矩形（绝对坐标 mm）；
 * ring / edges / keepOuts / doors 都相对 zone 左上角，与 along / gap 同一坐标基准。
 */
export interface AiRoomContext {
  roomId: string;
  name: string;
  area: number;
  zone: [number, number, number, number];
  openings: { kind: OpeningKind; edge: AiEdge; along: number; width: number; sill?: number }[];
  /** 房间净空轮廓（L 形等不规则房间不等于 zone）。 */
  ring: [number, number][];
  /** 每条边背后是实墙、矮墙、窗、门洞还是开敞。 */
  edges: AiRoomEdge[];
  /** 门前通行区、门扇开启范围、窗前区。 */
  keepOuts: { kind: KeepOutKind; poly: [number, number][] }[];
  /** 门口内侧的落脚点，过道连通检查的起点。 */
  doors: [number, number][];
}

/** 模型输出的家具（房间布局与整户家具共用）。 */
export interface AiPlacedItem {
  code: string;
  back: Side;
  along?: number;
  gap?: number;
}

/** 整户范例：一段需求 + 按输出约定写好的标准答案（由算法模板序列化而来）。 */
export interface AiPlanExample {
  requirement: string;
  output: {
    summary: string;
    width: number;
    depth: number;
    walls: { key: string; dir: "h" | "v"; at: number; from: number; to: number }[];
    rooms: { id: string; name: string; mat: string; box: [number, number, number, number] }[];
    openings: { wall: string; kind: OpeningKind; at: number; width: number; into?: Side }[];
    furniture: { room: string; items: AiPlacedItem[] }[];
  };
}

/** 单房间范例：房间净空尺寸与门窗（与真实请求同一格式）+ 标准答案。 */
export interface AiRoomExample {
  room: { name: string; width: number; depth: number; openings: AiRoomContext["openings"]; edges: AiRoomContext["edges"] };
  output: { items: AiPlacedItem[] };
}

/** 候选落地时的校正说明：已自动微调的、仍需手动处理的。 */
export interface AiLayoutNotes {
  adjusted: string[];
  unresolved: string[];
}

export interface AiCandidate<T> {
  id: string;
  index: number;
  summary: string;
  result: T;
  /** 落地时的校正说明；没有任何调整时省略。 */
  notes?: AiLayoutNotes;
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
