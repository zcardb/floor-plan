import { DECOR_STYLE_PRESETS } from "../data/decorStylePresets";
import type { Design, Furniture } from "./types";

/**
 * 装修风格（3D 渲染主题）。
 *
 * 风格只决定 3D 里「长什么样」：墙面颜色、家具主色、木作 / 五金 / 软装点缀。
 * 它不改方案的家具数据、不改 2D 平面图，也不进造价——平面图与预算仍然只看每个对象自己的字段。
 *
 * 每个风格先给「家具角色」一组颜色：同一张沙发在奶油风里是米白绒布、在工业风里是深灰皮质，
 * 靠角色到颜色的映射实现，而不是维护上百份家具清单；自定义风格还可以逐类家具单独定色（`items`）。
 *
 * 风格分两种来源：随代码发布的内置风格（data/decorStylePresets.ts），与账号自建的自定义风格
 * （id 以 `my-` 开头，存在账号素材库里）。方案使用自定义风格时会把定义一并存进方案（`customStyle`），
 * 与酷家乐「套用样板间」一致——之后再改风格库，不影响已经套用的方案，换设备、分享也能原样渲染。
 */

/** 家具在配色里扮演的角色；每类家具归入其中一个，风格只需给 7 个角色配色。 */
export type DecorRole =
  | "upholstery"
  | "bedding"
  | "cabinetry"
  | "tabletop"
  | "seating"
  | "rug"
  | "lamp";

/** 家具类型 → 配色角色。未列入的类型（家电、洁具、电视、绿植、钢琴等）保持固有色，不被风格改色。 */
const ROLE_OF: Record<string, DecorRole> = {
  sofa: "upholstery",
  armchair: "upholstery",
  cornersofa: "upholstery",
  beanbag: "upholstery",
  baycushion: "upholstery",
  bed: "bedding",
  crib: "bedding",
  wardrobe: "cabinetry",
  cabinet: "cabinetry",
  shoecab: "cabinetry",
  ovencol: "cabinetry",
  dresser: "cabinetry",
  vanity: "cabinetry",
  bookshelf: "cabinetry",
  tvstand: "cabinetry",
  counter: "cabinetry",
  island: "cabinetry",
  nightstand: "cabinetry",
  desk: "cabinetry",
  table: "tabletop",
  roundtable: "tabletop",
  coffeetable: "tabletop",
  sidetable: "tabletop",
  chair: "seating",
  officechair: "seating",
  barstool: "seating",
  rug: "rug",
  floorlamp: "lamp",
};

/** 腿型：木质收分腿 / 细金属腿（现代、工业、包豪斯这类风格用金属腿）。 */
export type LegKind = "wood" | "metal";

/** 五金件材质：拉手、灯杆、龙头等共用。 */
export type MetalFinish = "brass" | "chrome" | "black" | "nickel";

export const METAL_FINISH: Record<
  MetalFinish,
  { color: string; metalness: number; roughness: number }
> = {
  brass: { color: "#b9a06a", metalness: 0.85, roughness: 0.32 },
  chrome: { color: "#dfe3e6", metalness: 0.95, roughness: 0.12 },
  black: { color: "#2b2b2d", metalness: 0.6, roughness: 0.4 },
  nickel: { color: "#b6babd", metalness: 0.88, roughness: 0.26 },
};

/** 7 个家具角色的颜色；缺省项由 `BASE_TONE` 补齐。 */
export type DecorTone = Partial<Record<DecorRole, string>>;

/** 风格大类：对齐三维家方案库的风格筛选（不含没有固定配色的「混搭」），按当下热度排列；面板、管理页的分类筛选与内置风格的分组都用这个顺序。 */
export const DECOR_CATEGORIES = [
  "奶油", "原木", "现代", "简约", "北欧", "日式", "侘寂", "法式", "中古", "轻奢",
  "新中式", "美式", "欧式", "新古典", "中式", "地中海", "东南亚", "田园", "工业",
] as const;
export type DecorCategory = (typeof DECOR_CATEGORIES)[number];

export interface DecorStyle {
  id: string;
  name: string;
  /** 一句话说明，面板里显示在名称下面。 */
  summary: string;
  /** 风格大类；「默认配色」不属于任何大类。 */
  category?: DecorCategory;
  /** 面板里作为推荐项突出。 */
  recommended?: boolean;
  /** 家具保留自己保存的颜色，不按角色换色（「默认配色」及由它复制出来的自定义风格）。 */
  keep?: boolean;
  /** 墙面颜色。 */
  wall: string;
  /** 门扇颜色（入户门由构建器单独加深）。 */
  door: string;
  /** 木作颜色：家具框架、桌腿、床架等。 */
  wood: string;
  /** 深色收边：踢脚、桌底、深色腿。 */
  legs: string;
  metal: MetalFinish;
  legsKind: LegKind;
  /** 软装点缀：抱枕、搭毯、小件跳色。 */
  accent: string;
  /** 圆角强度（0.8–1.3）：奶油、侘寂更软，现代极简、包豪斯更利落。 */
  softness: number;
  tone: DecorTone;
  /** 逐类家具的主色（家具类型 → 颜色），优先于角色配色；自定义风格「单件定色」用。 */
  items?: Partial<Record<string, string>>;
}

/**
 * 各角色兜底色：默认风格（不改色）与任何 tone 缺项都用它，
 * 因此没有风格概念之前的样子可以被完整复现。
 */
const BASE_TONE: Record<DecorRole, string> = {
  upholstery: "#c9c3b8",
  bedding: "#f6f3ee",
  cabinetry: "#efe6d8",
  tabletop: "#e2cfb4",
  seating: "#cfc6b8",
  rug: "#d9cbb8",
  lamp: "#3d3a34",
};

/** 内置风格（数据见 data/decorStylePresets.ts）：默认配色排第一，其后按风格大类排列。 */
export const DECOR_STYLES: DecorStyle[] = DECOR_STYLE_PRESETS;

export const DEFAULT_DECOR_STYLE_ID = "default";

const BY_ID = new Map(DECOR_STYLES.map((s) => [s.id, s]));

/** 未知 id（旧数据、被删掉的风格）一律回落默认风格，保证任何方案都能渲染。 */
export const decorStyleById = (id: string | undefined): DecorStyle =>
  (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_DECOR_STYLE_ID)!;

/** 是否内置风格的 id。 */
export const isDecorStyleId = (id: string): boolean => BY_ID.has(id);

/** 自定义风格的 id 前缀：与内置 id 永不冲突。 */
const CUSTOM_PREFIX = "my-";
const CUSTOM_ID = /^my-[a-z0-9]{6,32}$/;
export const isCustomStyleId = (id: string): boolean => CUSTOM_ID.test(id);
export const newCustomStyleId = (): string => CUSTOM_PREFIX + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** 方案实际使用的风格：自定义风格取方案里存的定义，内置风格按 id 查，都没有就是默认配色。 */
export const designStyle = (d: Pick<Design, "styleId" | "customStyle">): DecorStyle =>
  d.customStyle && d.customStyle.id === d.styleId ? d.customStyle : decorStyleById(d.styleId);

/** 套用一个风格：自定义风格连同定义一起存进方案，内置风格只存 id。 */
export const applyStyle = (d: Design, style: DecorStyle): Design => {
  const next: Design = { ...d, styleId: style.id };
  if (isCustomStyleId(style.id)) next.customStyle = structuredClone(style);
  else delete next.customStyle;
  return next;
};

const HEX = /^#[0-9a-f]{6}$/;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const ROLES = new Set<string>(["upholstery", "bedding", "cabinetry", "tabletop", "seating", "rug", "lamp"]);
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** 自定义风格（来自账号库或方案）的完整校验：任何一项不合规都视为无效。 */
export function validDecorStyle(v: unknown): v is DecorStyle {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  const record = (value: unknown, key: (k: string) => boolean, max: number) =>
    value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length <= max && Object.entries(value).every(([k, c]) => key(k) && isHex(c));
  return typeof s.id === "string" && isCustomStyleId(s.id) &&
    text(s.name, 20) && typeof s.summary === "string" && s.summary.length <= 60 &&
    (s.category === undefined || (DECOR_CATEGORIES as readonly string[]).includes(s.category as string)) &&
    (s.keep === undefined || typeof s.keep === "boolean") &&
    [s.wall, s.door, s.wood, s.legs, s.accent].every(isHex) &&
    typeof s.metal === "string" && s.metal in METAL_FINISH &&
    (s.legsKind === "wood" || s.legsKind === "metal") &&
    typeof s.softness === "number" && s.softness >= 0.8 && s.softness <= 1.3 &&
    record(s.tone, (k) => ROLES.has(k), ROLES.size) &&
    (s.items === undefined || record(s.items, (k) => /^[a-z]{2,24}$/.test(k), 100));
}

/** 方案里风格字段的清洗：内置 id 原样保留；自定义风格须带合法定义且 id 对得上；其余一律丢弃，按默认配色渲染。 */
export function designStyleFields(styleId: unknown, customStyle: unknown): Pick<Design, "styleId" | "customStyle"> {
  if (typeof styleId !== "string") return {};
  if (isDecorStyleId(styleId)) return { styleId };
  return validDecorStyle(customStyle) && customStyle.id === styleId ? { styleId, customStyle } : {};
}

/** 风格搜索：名称、说明、大类任一包含关键词即匹配（不区分大小写）。 */
export const matchStyle = (style: DecorStyle, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || [style.name, style.summary, style.category ?? ""].some((field) => field.toLowerCase().includes(q));
};

/** 3D 构建家具时用的配色结果：每个色值都已解析，构建器不再做风格判断。 */
export interface FurnitureLook {
  /** 主体色：沙发布面、柜体、桌面等。 */
  main: string;
  /** 木色：框架与桌腿。 */
  wood: string;
  /** 深色收边。 */
  legs: string;
  /** 软装点缀（抱枕、搭毯）。 */
  accent: string;
  /** 五金件颜色。 */
  metal: string;
  metalness: number;
  roughness: number;
  legsKind: LegKind;
  /** 圆角缩放，供软包家具调用。 */
  softness: number;
}

export const furnitureRole = (type: string): DecorRole | undefined => ROLE_OF[type];

/** 一件家具在某风格下的主色：单件定色 → 保留自身颜色（默认配色）→ 角色配色 → 角色兜底色 → 自身颜色。 */
export function furnitureMain(style: DecorStyle, f: Pick<Furniture, "type" | "color">): string {
  const role = ROLE_OF[f.type];
  return style.items?.[f.type] ?? (style.keep ? f.color : (role && style.tone[role]) || (role && BASE_TONE[role]) || f.color);
}

/** 一件家具在某风格下的配色；默认风格保留家具自己的颜色。 */
export function furnitureLook(style: DecorStyle, f: Furniture): FurnitureLook {
  const metal = METAL_FINISH[style.metal];
  return {
    main: furnitureMain(style, f),
    wood: style.wood,
    legs: style.legs,
    accent: style.accent,
    metal: metal.color,
    metalness: metal.metalness,
    roughness: metal.roughness,
    legsKind: style.legsKind,
    softness: style.softness,
  };
}

/** 7 个家具角色的中文名，顺序即详情页展示顺序。 */
export const DECOR_ROLES: { id: DecorRole; label: string }[] = [
  { id: "upholstery", label: "软包" },
  { id: "bedding", label: "床品" },
  { id: "cabinetry", label: "柜体" },
  { id: "tabletop", label: "桌面" },
  { id: "seating", label: "坐具" },
  { id: "rug", label: "地毯" },
  { id: "lamp", label: "灯具" },
];

/** 五金件材质的中文名。 */
export const METAL_LABEL: Record<MetalFinish, string> = { brass: "黄铜", chrome: "亮铬", black: "哑黑", nickel: "拉丝镍" };

/** 某个角色在风格里的颜色（缺省用兜底色）。 */
export const roleColor = (style: DecorStyle, role: DecorRole): string => style.tone[role] ?? BASE_TONE[role];

/**
 * 从方案提取配色（参考酷家乐「保存为样板间」）：每类家具取方案里第一件的颜色作为单件定色，
 * 墙面取方案里用得最多的自定义墙色；方案没设墙色时不返回 wall。
 */
export function extractDesignColors(d: Pick<Design, "furniture" | "walls">): { items: Record<string, string>; wall?: string } {
  const items: Record<string, string> = {};
  for (const f of d.furniture) if (!(f.type in items) && HEX.test(f.color)) items[f.type] = f.color;
  const count = new Map<string, number>();
  for (const w of d.walls) if (w.color && HEX.test(w.color)) count.set(w.color, (count.get(w.color) ?? 0) + 1);
  const wall = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return wall ? { items, wall } : { items };
}

/**
 * 新建自定义风格：以一套现有风格为起点复制全部取值（不带「推荐」标记），换上新 id、名称与大类；
 * 传入方案时再叠加从方案提取的配色。创建后可在风格详情里逐项细调。
 */
export function createCustomStyle({ base, name, category, design }: {
  base: DecorStyle;
  name: string;
  category?: DecorCategory;
  design?: Pick<Design, "furniture" | "walls">;
}): DecorStyle {
  const { recommended: _recommended, ...rest } = structuredClone(base);
  const extracted = design ? extractDesignColors(design) : undefined;
  return {
    ...rest,
    id: newCustomStyleId(),
    name: name.trim(),
    summary: (design ? "从当前方案提取配色，" : "") + `基于「${base.name}」`,
    ...(category ? { category } : {}),
    ...(extracted?.wall ? { wall: extracted.wall } : {}),
    ...(extracted && Object.keys(extracted.items).length ? { items: { ...rest.items, ...extracted.items } } : {}),
  };
}

/** 面板配色条：墙面 / 木作 / 主体软装 / 点缀 / 五金。 */
export const styleSwatches = (style: DecorStyle): string[] => [
  style.wall,
  style.wood,
  style.tone.upholstery ?? BASE_TONE.upholstery,
  style.accent,
  METAL_FINISH[style.metal].color,
];

/** 自定义风格：style_key 即风格 id，名称单独成列，其余定义在 spec；不合规的行丢弃。 */
export function styleFromRow(r: Record<string, unknown>): DecorStyle | null {
  const spec = r.spec && typeof r.spec === 'object' && !Array.isArray(r.spec) ? r.spec as Record<string, unknown> : {};
  const style = { ...spec, id: String(r.style_key), name: String(r.name) };
  return validDecorStyle(style) ? style : null;
}
