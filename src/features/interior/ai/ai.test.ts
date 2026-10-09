import { describe, expect, it } from "vitest";
import { library } from "../data/catalog";
import { createProject, referenceDesign } from "../data/templates";
import { isPristineDesign } from "../model/templateState";
import { area, inRoom } from "../model/geometry";
import { validateDesign } from "../model/validation";
import type { LibraryItem } from "../model/types";
import { applyRoomLayout, planToDesign } from "./apply";
import { buildAiCatalog, isBuiltinItem } from "./catalog";
import { furnitureInRoom, planSnapshot, roomContext, roomZone } from "./context";
import { addPick, initialPicks, pickNames, removePick, requiredOf, resizePick, withPickSizes } from "./picks";
import { sanitizePlan, sanitizeRoomItems } from "./sanitize";

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
    const items = sanitizeRoomItems({ items: [...raw.items, { code: stand, back: "left", along: 999999 }] }, { zone, ring: master.rings[0], catalog });
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
    const items = sanitizeRoomItems(raw, { zone, ring: master.rings[0], catalog });
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
    const spec = sanitizePlan(plan, { width: 8000, depth: 9000, catalog });
    expect(spec.walls.map((w) => w.key)).toEqual(["w-1", "w-2"]);
    expect(spec.rooms.map((r) => r.name)).toEqual(["客厅", "主卧", "次卧"]);
    expect(spec.rooms.find((r) => r.name === "次卧")!.mat).toBe("wood");
    // 底墙上的窗与门重叠被丢弃；「bottom」被当内墙名的那面墙被丢弃，开口仍是外墙
    expect(spec.openings.map((o) => `${o.wall}:${o.kind}`)).toEqual(["bottom:door", "top:door", "w-2:door"]);
    expect(spec.furniture.flatMap((z) => z.items)).toHaveLength(2);
  });
  it("落地为 AI 户型：结构可编辑、可通过校验、家具都在各自房间内、不能视为初始模板", () => {
    const design = planToDesign(sanitizePlan(plan, { width: 8000, depth: 9000, catalog }), catalog);
    expect(design).toMatchObject({ templateId: "ai", width: 8000, depth: 9000, structureUnlocked: true });
    expect(() => validateDesign(design)).not.toThrow();
    expect(design.rooms.reduce((s, r) => s + area(r), 0)).toBeGreaterThan(65);
    for (const f of design.furniture) expect(design.rooms.some((r) => inRoom([f.cx, f.cy], r))).toBe(true);
    expect(isPristineDesign(design)).toBe(false);
    const project = createProject("ai", "", undefined, design);
    expect(project.name).toBe("AI 户型");
    expect(project.state.rooms).toEqual(design.rooms);
  });
  it("房间全部不可用时抛错", () => {
    expect(() => sanitizePlan({ ...plan, rooms: [{ id: "x", box: [0, 0, 10, 10] }] }, { width: 8000, depth: 9000, catalog })).toThrow("房间");
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
  it("没填长宽时取模型给的尺寸；填了以填的为准；都没有时报错", () => {
    expect(sanitizePlan(plan, { catalog })).toMatchObject({ width: 7000, depth: 8000 });
    expect(sanitizePlan(plan, { catalog, width: 9000 })).toMatchObject({ width: 9000, depth: 8000 });
    expect(() => sanitizePlan({ ...plan, width: undefined }, { catalog })).toThrow("尺寸");
  });
});
