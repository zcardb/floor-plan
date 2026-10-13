import { describe, expect, it } from "vitest";
import { isBuiltinItem, library } from "@/lib/floor-plan/catalog";
import { createProject, referenceDesign } from "@/lib/floor-plan/templates";
import { isPristineDesign } from "@/features/projects/model/template-state";
import { area, inRoom } from "@/lib/floor-plan/geometry";
import { validateDesign } from "@/lib/floor-plan/validation";
import type { LibraryItem } from "@/lib/floor-plan/types";
import { applyRoomLayout, planToDesign } from "../model/apply";
import { buildAiCatalog } from "../model/catalog";
import { furnitureInRoom, planSnapshot, roomContext, roomZone } from "../model/context";
import { addPick, initialPicks, pickNames, removePick, requiredOf, resizePick, withPickSizes } from "../model/picks";
import { sanitizePlan, sanitizeRoomItems } from "../model/sanitize";

const account: LibraryItem = { catalogId: "11111111-1111-4111-8111-111111111111", name: "我的书桌", category: "书房", type: "desk", w: 1300, d: 650, color: "#aa8866", height: 760 };
const project: LibraryItem = { catalogId: "22222222-2222-4222-8222-222222222222", name: "项目沙发", category: "客厅", type: "sofa", w: 2200, d: 900, color: "#887766" };
const codeOf = (catalog: ReturnType<typeof buildAiCatalog>, name: string) => catalog.entries.find((e) => e.name === name)!.code;

describe("AI 家具目录（动态注册表 + 代号）", () => {
  it("内置 + 项目 + 账号家具都进目录，并分到 F1…Fn 代号", () => {
    const catalog = buildAiCatalog({ project: [project], account: [account] });
    expect(catalog.entries).toHaveLength(library.length + 2);
    expect(catalog.entries.map((e) => e.code)).toEqual(catalog.entries.map((_, i) => `F${i + 1}`));
    expect(catalog.byCode.get(codeOf(catalog, "我的书桌"))).toMatchObject({ catalogId: account.catalogId });
    expect(catalog.codeOf(project.catalogId!)).toBe(codeOf(catalog, "项目沙发"));
  });
  it("以后新增的账号家具自动进入目录；同一 catalogId 不重复；代号对同一输入稳定", () => {
    const before = buildAiCatalog();
    const after = buildAiCatalog({ account: [account, { ...account }], project: [] });
    expect(after.entries.length).toBe(before.entries.length + 1);
    expect(buildAiCatalog({ account: [account] }).entries).toEqual(after.entries);
  });
  it("内置家具按 catalogId 判断，账号家具不算内置", () => {
    expect(library.every(isBuiltinItem)).toBe(true);
    expect(isBuiltinItem(account)).toBe(false);
  });
});

describe("房间上下文", () => {
  const d = referenceDesign();
  const master = d.rooms.find((r) => r.id === "master")!;
  it("目标房间带门窗归属边与沿边位置", () => {
    const ctx = roomContext(d, master);
    expect(ctx.zone).toEqual(roomZone(master));
    expect(ctx.openings.length).toBeGreaterThan(0);
    for (const o of ctx.openings) {
      expect(["up", "down", "left", "right"]).toContain(o.edge);
      expect(o.along).toBeGreaterThanOrEqual(-200);
    }
  });
  it("整套户型快照包含所有房间与门窗连通关系，不含目标房间的家具", () => {
    const snap = planSnapshot(d, master.id);
    expect(snap.rooms).toHaveLength(d.rooms.length);
    expect(snap.openings.some((o) => o.kind === "door" && o.rooms.length >= 2)).toBe(true);
    expect(snap.furniture.some((f) => f.room === master.name)).toBe(false);
    expect(snap.furniture.length).toBeGreaterThan(0);
  });
});

describe("指定家具清单", () => {
  const d = referenceDesign();
  const master = d.rooms.find((r) => r.id === "master")!;
  const catalog = buildAiCatalog();
  it("默认带出房间现有家具，同款合并计数", () => {
    const picks = initialPicks(d, master, catalog);
    expect(picks.reduce((s, p) => s + p.count, 0)).toBe(furnitureInRoom(d, master).length);
    expect(picks.find((p) => p.catalogId === "nightstand:床头柜")?.count).toBe(2);
  });
  it("新增可重复（计数 +1），✕ 减一件，转成代号清单", () => {
    let picks = addPick([], "bed:双人床 1.8m");
    picks = addPick(picks, "nightstand:床头柜");
    picks = addPick(picks, "nightstand:床头柜");
    expect(pickNames(picks, catalog)).toEqual(["双人床 1.8m", "床头柜 ×2"]);
    expect(requiredOf(picks, catalog)).toEqual([{ code: codeOf(catalog, "双人床 1.8m"), count: 1 }, { code: codeOf(catalog, "床头柜"), count: 2 }]);
    picks = removePick(picks, "nightstand:床头柜");
    picks = removePick(picks, "bed:双人床 1.8m");
    expect(picks).toEqual([{ catalogId: "nightstand:床头柜", count: 1 }]);
  });
});

describe("房间布局候选清洗与落地", () => {
  const d = referenceDesign();
  const master = d.rooms.find((r) => r.id === "master")!;
  const catalog = buildAiCatalog({ account: [account] });
  const zone = roomZone(master);
  const bed = codeOf(catalog, "双人床 1.8m"), stand = codeOf(catalog, "床头柜"), desk = codeOf(catalog, "我的书桌");
  const raw = { items: [
    { code: bed, back: "up", along: 1800, gap: 0 },
    { code: stand, back: "up", along: 600, gap: 0 },
    { code: stand, back: "up", along: 3000, gap: 0 },
    { code: desk, back: "down", along: 1000, gap: 0 },
    { code: "F9999", back: "up", along: 100 },
    { code: bed, back: "sideways" },
  ] };
  it("未知代号与非法方向被丢弃，沿墙位置夹进房间", () => {
    const items = sanitizeRoomItems({ items: [...raw.items, { code: stand, back: "left", along: 999999 }] }, { zone, catalog });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.catalogId)).toBe(true);
    const far = items[items.length - 1];
    expect(far.along).toBeLessThanOrEqual(zone[3] - zone[1]);
  });
  it("指定清单非空时件数必须完全一致，否则丢弃候选", () => {
    const required = [{ code: bed, count: 1 }, { code: stand, count: 2 }, { code: desk, count: 1 }];
    expect(sanitizeRoomItems(raw, { zone, catalog, required })).toHaveLength(4);
    expect(() => sanitizeRoomItems(raw, { zone, catalog, required: [{ code: bed, count: 1 }, { code: stand, count: 2 }] })).toThrow("不一致");
    expect(() => sanitizeRoomItems(raw, { zone, catalog, required: [{ code: stand, count: 3 }, { code: bed, count: 1 }, { code: desk, count: 1 }] })).toThrow("不一致");
  });
  it("没有可落地的条目时抛错而不是返回空方案", () => {
    expect(() => sanitizeRoomItems({ items: [{ code: "F9999", back: "up" }] }, { zone, catalog })).toThrow();
    expect(() => sanitizeRoomItems({ nope: true }, { zone, catalog })).toThrow();
  });
  it("应用：只替换该房间家具，沿用同款外观，账号家具登记进项目目录，方案可通过校验", () => {
    const painted = { ...d, furniture: d.furniture.map((f) => (inRoom([f.cx, f.cy], master) && f.type === "nightstand" ? { ...f, color: "#123456" } : f)) };
    const items = sanitizeRoomItems(raw, { zone, catalog });
    const next = applyRoomLayout(painted, master.id, items, catalog);
    const inside = furnitureInRoom(next, master);
    expect(inside).toHaveLength(4);
    expect(inside.filter((f) => f.type === "nightstand").every((f) => f.color === "#123456")).toBe(true);
    expect(inside.find((f) => f.name === "我的书桌")).toMatchObject({ catalogId: account.catalogId, height: 760 });
    expect(next.customCatalog?.map((i) => i.catalogId)).toContain(account.catalogId);
    const others = (x: typeof d) => x.furniture.filter((f) => !inRoom([f.cx, f.cy], master)).map((f) => f.id);
    expect(others(next)).toEqual(others(painted));
    expect(next.walls).toBe(painted.walls);
    expect(() => validateDesign(next)).not.toThrow();
    // 贴墙家具没有被推离墙面
    const bedPlaced = inside.find((f) => f.type === "bed")!;
    expect(bedPlaced.cy - bedPlaced.d / 2).toBe(zone[1]);
  });
});

describe("整户户型候选清洗与落地", () => {
  const catalog = buildAiCatalog();
  const bed = codeOf(catalog, "双人床 1.5m"), sofa = codeOf(catalog, "三人沙发");
  const plan = {
    summary: "两室",
    width: 8000,
    depth: 9000,
    walls: [
      { key: "spine", dir: "h", at: 4000, from: 0, to: 8000 },
      { key: "bottom", dir: "h", at: 2000, from: 0, to: 8000 },
      { key: "mid", dir: "v", at: 4000, from: 0, to: 4000 },
      { key: "stub", dir: "h", at: 7000, from: 0, to: 200 },
    ],
    rooms: [
      { id: "living", name: "客厅", mat: "tile800", box: [0, 4000, 8000, 9000] },
      { id: "bed1", name: "主卧", mat: "wood", box: [0, 0, 4000, 4000] },
      { id: "bed2", name: "次卧", mat: "nope", box: [4000, 0, 8000, 4000] },
      { id: "tiny", name: "储物", box: [0, 0, 100, 100] },
    ],
    openings: [
      { wall: "bottom", kind: "door", at: 4000, width: 1000, into: "up" },
      { wall: "bottom", kind: "window", at: 4300, width: 1500 },
      { wall: "top", kind: "door", at: 2000, width: 900, into: "up" },
      { wall: "mid", kind: "door", at: 3000, width: 800, into: "left" },
      { wall: "ghost", kind: "door", at: 1000, width: 800 },
    ],
    furniture: [
      { room: "bed1", items: [{ code: bed, back: "up", along: 2000, gap: 0 }] },
      { room: "客厅", items: [{ code: sofa, back: "down", along: 4000, gap: 0 }, { code: "F0", back: "up" }] },
    ],
  };
  it("内墙 key 重新命名、门窗跟着映射；与外墙同名的内墙、碎墙、越界 / 重叠 / 悬空的门窗、过小房间都被丢弃", () => {
    const spec = sanitizePlan(plan, { catalog });
    expect(spec.walls.map((w) => w.key)).toEqual(["w-1", "w-2"]);
    expect(spec.rooms.map((r) => r.name)).toEqual(["客厅", "主卧", "次卧"]);
    expect(spec.rooms.find((r) => r.name === "次卧")!.mat).toBe("wood");
    // 底墙上的窗与门重叠被丢弃；「bottom」被当内墙名的那面墙被丢弃，开口仍是外墙
    expect(spec.openings.map((o) => `${o.wall}:${o.kind}`)).toEqual(["bottom:door", "top:door", "w-2:door"]);
    expect(spec.furniture.flatMap((z) => z.items)).toHaveLength(2);
  });
  it("落地为 AI 户型：结构可编辑、可通过校验、家具都在各自房间内、不能视为初始模板", () => {
    const design = planToDesign(sanitizePlan(plan, { catalog }), catalog);
    expect(design).toMatchObject({ templateId: "ai", width: 8000, depth: 9000 });
    expect(() => validateDesign(design)).not.toThrow();
    expect(design.rooms.reduce((s, r) => s + area(r), 0)).toBeGreaterThan(65);
    for (const f of design.furniture) expect(design.rooms.some((r) => inRoom([f.cx, f.cy], r))).toBe(true);
    expect(isPristineDesign(design)).toBe(false);
    const project = createProject("ai", "", undefined, design);
    expect(project.name).toBe("AI 户型");
    expect(project.state.rooms).toEqual(design.rooms);
  });
  it("落地时默认清空分割：门窗所在墙比洞口长，可以沿墙拖动", () => {
    const design = planToDesign(sanitizePlan(plan, { catalog }), catalog);
    expect(design.walls.some((w) => w.id.startsWith("opening-wall-"))).toBe(false);
    for (const o of design.openings) {
      const wall = design.walls.find((w) => w.id === o.wallId)!;
      expect(Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])).toBeGreaterThan(o.width);
    }
  });
  it("房间全部不可用时抛错", () => {
    expect(() => sanitizePlan({ ...plan, rooms: [{ id: "x", box: [0, 0, 10, 10] }] }, { catalog })).toThrow("房间");
  });
  it("模型把外墙厚度算进室内（房间与内墙从 120 起）：贴外墙的边与顶到外墙的墙端吸附到外轮廓，不留白边", () => {
    // 真实回包节选：10 × 14 m，房间与内墙都离外轮廓 120
    const inset = {
      width: 10000, depth: 14000, openings: [], furniture: [],
      walls: [
        { key: "a", dir: "v", at: 6800, from: 120, to: 5680 },
        { key: "c", dir: "h", at: 5680, from: 120, to: 9880 },
        { key: "e", dir: "v", at: 2200, from: 11000, to: 13880 },
      ],
      rooms: [
        { id: "living", name: "客厅餐厅", box: [120, 120, 6800, 5680] },
        { id: "bath", name: "卫浴", box: [6800, 120, 9880, 5680] },
        { id: "master", name: "主卧", poly: [[120, 5680], [9880, 5680], [9880, 13880], [2200, 13880], [2200, 11000], [120, 11000]] },
        { id: "ensuite", name: "主卫", box: [120, 11000, 2200, 13880] },
      ],
    };
    const spec = sanitizePlan(inset, { catalog });
    expect(spec.walls.map((w) => [w.from, w.to])).toEqual([[0, 5680], [0, 10000], [11000, 14000]]);
    const box = (name: string) => {
      const ring = spec.rooms.find((r) => r.name === name)!.poly;
      return [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
    };
    expect(box("客厅餐厅")).toEqual([0, 0, 6740, 5620]);
    expect(box("卫浴")).toEqual([6860, 0, 10000, 5620]);
    expect(box("主卧")).toEqual([0, 5740, 10000, 14000]);
    expect(box("主卫")).toEqual([0, 11000, 2140, 14000]);
    // 落地后房间铺满外墙内表面：10 × 14 = 140 m² 只扣内墙占地（约 2.2 m²）；吸附前只有约 132 m²
    const design = planToDesign(spec, catalog);
    expect(() => validateDesign(design)).not.toThrow();
    expect(design.rooms.reduce((s, r) => s + area(r), 0)).toBeGreaterThan(137.5);
  });
  it("离外轮廓 300 以上的房间边不吸附（真正的走廊 / 留白保持原样）", () => {
    const far = { width: 8000, depth: 8000, walls: [], openings: [], furniture: [], rooms: [{ id: "a", name: "卧室", box: [400, 0, 8000, 8000] }] };
    expect(sanitizePlan(far, { catalog }).rooms[0]!.poly.map((p) => p[0])).toContain(400);
  });
});

describe("指定家具改尺寸", () => {
  const catalog = buildAiCatalog();
  const bed = "bed:双人床 1.8m";
  it("改尺寸后本次请求的目录按新尺寸给模型与落地；与默认相同视为恢复", () => {
    let picks = addPick([], bed);
    picks = resizePick(picks, bed, { w: 1600, d: 2000 }, { w: 1800, d: 2000 });
    const sized = withPickSizes(catalog, picks);
    const code = catalog.codeOf(bed)!;
    expect(sized.entries.find((e) => e.code === code)).toMatchObject({ w: 1600, d: 2000 });
    expect(sized.byCode.get(code)).toMatchObject({ w: 1600, catalogId: bed });
    expect(catalog.byCode.get(code)!.w).toBe(1800);
    expect(pickNames(picks, sized)[0]).toContain("1.60 × 2.00 m");
    expect(resizePick(picks, bed, { w: 1800, d: 2000 }, { w: 1800, d: 2000 })[0].size).toBeUndefined();
    const d = referenceDesign(), master = d.rooms.find((r) => r.id === "master")!;
    const items = sanitizeRoomItems({ items: [{ code, back: "up", along: 1800, gap: 0 }] }, { zone: roomZone(master), catalog: sized, required: [{ code, count: 1 }] });
    const placed = furnitureInRoom(applyRoomLayout(d, master.id, items, sized), master);
    expect(placed[0]).toMatchObject({ w: 1600, d: 2000 });
  });
});

describe("AI 决定户型尺寸", () => {
  const catalog = buildAiCatalog();
  const bed = catalog.entries.find((e) => e.name === "双人床 1.5m")!.code;
  const plan = { width: 7000, depth: 8000, walls: [], openings: [{ wall: "bottom", kind: "door", at: 3000, width: 1000 }],
    rooms: [{ id: "a", name: "卧室", box: [0, 0, 7000, 8000] }], furniture: [{ room: "a", items: [{ code: bed, back: "up" }] }] };
  it("取模型按描述给出的尺寸，超出范围时夹到 3000–40000；没有尺寸时报错", () => {
    expect(sanitizePlan(plan, { catalog })).toMatchObject({ width: 7000, depth: 8000 });
    expect(sanitizePlan({ ...plan, width: 100000, depth: 1000 }, { catalog })).toMatchObject({ width: 40000, depth: 3000 });
    expect(() => sanitizePlan({ ...plan, width: undefined }, { catalog })).toThrow("尺寸");
  });
});

describe("不规则外轮廓（outline）", () => {
  const catalog = buildAiCatalog();
  const bed = codeOf(catalog, "双人床 1.5m");
  // L 形：右上角缺 4000 × 3000；e2 是 x=8000 的竖墙，e5 是底边。
  const outline = [[0, 0], [8000, 0], [8000, 3000], [12000, 3000], [12000, 10000], [0, 10000]];
  const plan = {
    width: 12000, depth: 10000, outline,
    walls: [{ key: "a", dir: "h", at: 6000, from: 0, to: 12000 }],
    rooms: [
      { id: "bed", name: "主卧", box: [0, 0, 8000, 6000] },
      { id: "living", name: "客厅", poly: [[0, 6000], [12000, 6000], [12000, 10000], [0, 10000]] },
    ],
    openings: [
      { wall: "e5", kind: "door", at: 6000, width: 1000, into: "up" },
      { wall: "e1", kind: "window", at: 4000, width: 1800 },
      { wall: "e2", kind: "window", at: 1500, width: 1200 },
      { wall: "top", kind: "window", at: 10000, width: 1200 },
      { wall: "a", kind: "door", at: 3000, width: 900, into: "up" },
    ],
    furniture: [{ room: "bed", items: [{ code: bed, back: "up", along: 4000, gap: 0 }] }],
  };
  it("合法 outline 原样保留；门窗可以引用 e1…eN，矩形外墙名 top 不再可用", () => {
    const spec = sanitizePlan(plan, { catalog });
    expect(spec.outline).toEqual(outline);
    expect(spec.openings.map((o) => `${o.wall}:${o.kind}`)).toEqual(["e5:door", "e1:window", "e2:window", "w-1:door"]);
    expect(spec.openings.find((o) => o.wall === "e2")!.at).toBe(1500);
  });
  it("落地后外墙沿 L 形生成（6 段），不再是 width × depth 的矩形，且能通过校验", () => {
    const design = planToDesign(sanitizePlan(plan, { catalog }), catalog);
    expect(() => validateDesign(design)).not.toThrow();
    const exterior = design.walls.filter((w) => w.kind === "exterior");
    // 缺角处的两段外墙：x = 8000 + 120 的竖墙、y = 3000 - 120 的横墙。
    expect(exterior.some((w) => w.a[0] === 8120 && w.b[0] === 8120)).toBe(true);
    expect(exterior.some((w) => w.a[1] === 2880 && w.b[1] === 2880)).toBe(true);
    // 缺角区域（右上 4000 × 3000）里没有外墙穿过：不存在 y = -120 且延伸到 x > 8240 的顶墙。
    expect(exterior.some((w) => w.a[1] === -120 && w.b[1] === -120 && Math.max(w.a[0], w.b[0]) > 8240)).toBe(false);
    expect(design.openings.filter((o) => o.kind === "window")).toHaveLength(2);
  });
  it("斜边、点数不足或边太短的 outline 被忽略，退回矩形外墙；引用 e1…eN 的门窗随之丢弃", () => {
    for (const bad of [[[0, 0], [12000, 0], [12000, 10000]], [[0, 0], [12000, 0], [12000, 10000], [6000, 9000], [0, 10000]], [[0, 0], [12000, 0], [12000, 10000], [11900, 10000], [11900, 9900], [0, 9900]]]) {
      const spec = sanitizePlan({ ...plan, outline: bad }, { catalog });
      expect(spec.outline).toBeUndefined();
      expect(spec.openings.map((o) => o.wall)).toEqual(["top", "w-1"]);
    }
  });
});

describe("指定家具不因放不下而丢件", () => {
  it("比房间还大的家具也保留（夹到分区内），指定件数仍然对得上", () => {
    const catalog = buildAiCatalog();
    const d = referenceDesign(), master = d.rooms.find((r) => r.id === "master")!;
    const code = catalog.codeOf("bed:双人床 1.8m")!;
    const huge = withPickSizes(catalog, [{ catalogId: "bed:双人床 1.8m", count: 1, size: { w: 9000, d: 2000 } }]);
    const items = sanitizeRoomItems({ items: [{ code, back: "up", along: 99999, gap: -5 }] }, { zone: roomZone(master), catalog: huge, required: [{ code, count: 1 }] });
    expect(items).toHaveLength(1);
    expect(items[0].gap).toBe(0);
  });
});

describe("AI 户型贴墙家具不留半个墙厚的缝", () => {
  const catalog = buildAiCatalog();
  const sofa = codeOf(catalog, "三人沙发");
  /**
   * 客厅上边是外墙内表面（y = 0），下边是内墙中心线（y = 4000）；净空下边因此是 3940。
   * 模型按中心线矩形量取，贴墙时给的就是半个内墙厚（60）。
   */
  const plan = (gap: number) => ({
    summary: "贴墙",
    width: 6000,
    depth: 6000,
    walls: [{ key: "spine", dir: "h", at: 4000, from: 0, to: 6000 }],
    rooms: [
      { id: "living", name: "客厅", mat: "tile800", box: [0, 0, 6000, 4000] },
      { id: "rest", name: "储物", mat: "wood", box: [0, 4000, 6000, 6000] },
    ],
    openings: [],
    furniture: [{ room: "living", items: [{ code: sofa, back: "down", along: 3000, gap }] }],
  });
  const gapOf = (gap: number) => sanitizePlan(plan(gap), { catalog }).furniture[0]!.items[0]!.gap;
  /** 落地后沙发背面（back = down 时是 y 的正方向那一边）与房间净空下边的距离。 */
  const edge = (gap: number) => {
    const design = planToDesign(sanitizePlan(plan(gap), { catalog }), catalog);
    const f = design.furniture[0]!;
    const room = design.rooms.find((r) => r.name === "客厅")!;
    return { back: f.cy + f.d / 2, face: roomZone(room)[3] };
  };
  it("模型为墙厚留的 60 mm 换算成 0：背面正好落在净空边上", () => {
    expect(gapOf(60)).toBe(0);
    const { back, face } = edge(60);
    expect(back).toBe(face);
  });
  it("gap 0 仍然贴墙；模型想留的真实缝隙只少半个墙厚（150 → 90）", () => {
    expect(gapOf(0)).toBe(0);
    expect(edge(0).back).toBe(edge(0).face);
    expect(gapOf(150)).toBe(90);
    const { back, face } = edge(150);
    expect(face - back).toBe(90);
  });
  it("负数与超过分区高度的 gap 仍然夹进分区", () => {
    expect(gapOf(-40)).toBe(0);
    // 净空上下高 3940：夹到分区高度后家具贴在另一条边上。
    expect(gapOf(99999)).toBe(3940);
  });
  it("房间布局（room 模式）的 gap 不平移：贴墙 0 仍是 0、真实缝隙 1500 不变", () => {
    const zone: [number, number, number, number] = [0, 0, 4000, 3000];
    const specs = sanitizeRoomItems({ items: [{ code: sofa, back: "down", along: 2000, gap: 0 }, { code: sofa, back: "up", along: 2000, gap: 1500 }] }, { zone, catalog });
    expect(specs.map((s) => s.gap)).toEqual([0, 1500]);
  });
});
