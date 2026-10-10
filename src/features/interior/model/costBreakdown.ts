import {
  calculateCosts,
  furnitureKey,
  openingDimensions,
  openingRoomOverlap,
  priceOf,
  wallSurfaceArea,
  type PriceGroup,
} from "./costs";
import { floorMaterialOf } from "./floorMaterials";
import { openingName, openingPriceKey, roofSurfaceArea, surfaceMaterialOf, wallMaterialOf } from "./hardMaterials";
import { area, inRoom } from "./geometry";
import type { Design, Opening, Selection } from "./types";
import { isStairs } from "./stairs";

/** 一条成本明细：归类、数量、单价与金额，并带上可直接改价的 key。 */
export interface CostPart {
  group: PriceGroup | "labor";
  key: string;
  label: string;
  note?: string;
  quantity: number;
  unit: "m²" | "件" | "张" | "箱" | "元";
  price: number | null;
  subtotal: number;
  /** 人工费用按 id 定位，价格组按 key 定位。 */
  refId?: string;
}
export interface RoomCost {
  roomId: string;
  hard: CostPart[];
  soft: CostPart[];
  hardTotal: number;
  softTotal: number;
  total: number;
  unpriced: number;
}
export interface CostBreakdown {
  rooms: RoomCost[];
  shared: CostPart[];
  sharedTotal: number;
  softTotal: number;
  hardTotal: number;
  total: number;
  roomTotal: number;
  unpriced: number;
  /** 已定价条目数与可定价条目总数，用于完成度进度。 */
  pricedCount: number;
  priceableCount: number;
}
const fix = (n: number) => Math.round(n * 100) / 100;
const sum = (parts: CostPart[]) => parts.reduce((s, p) => s + p.subtotal, 0);
const empty = (roomId: string): RoomCost => ({
  roomId,
  hard: [],
  soft: [],
  hardTotal: 0,
  softTotal: 0,
  total: 0,
  unpriced: 0,
});
function finalize(room: RoomCost): RoomCost {
  const hardTotal = fix(sum(room.hard)),
    softTotal = fix(sum(room.soft)),
    parts = [...room.hard, ...room.soft];
  return {
    ...room,
    hardTotal,
    softTotal,
    total: fix(hardTotal + softTotal),
    unpriced: new Set(
      parts.filter((p) => p.price === null).map((p) => p.group + p.key),
    ).size,
  };
}
/**
 * 在 calculateCosts 的全屋总额基础上，把每笔费用归属到房间或全屋公共项。
 * 地面按面积占比分摊，门窗在相邻房间之间平分，拆改与人工留在公共项。
 * 不变量：Σ 房间金额 + 公共项 = calculateCosts().total。
 */
export function costBreakdown(d: Design): CostBreakdown {
  const c = calculateCosts(d),
    byId = new Map(
      d.rooms.map((r) => [r.id, empty(r.id)] as [string, RoomCost]),
    ),
    rooms = [...byId.values()],
    shared: CostPart[] = [];
  // 地面：先算每种材质的实际采购额，再按房间面积占比分摊。
  const floorNet = new Map<string, number>();
  for (const r of d.rooms)
    floorNet.set(r.mat, (floorNet.get(r.mat) || 0) + area(r));
  const floorRows = new Map(
    c.hard.filter((r) => r.group === "floorPrices").map((r) => [r.key, r]),
  );
  for (const r of d.rooms) {
    const row = floorRows.get(r.mat),
      net = floorNet.get(r.mat) || 0;
    if (!row) continue;
    const share = net > 0 ? area(r) / net : 0,
      purchased = row.quantity * share;
    byId.get(r.id)?.hard.push({
      group: "floorPrices",
      key: r.mat,
      label: floorMaterialOf(d, r.mat).name,
      note: net > 0 ? `按面积分摊 · 全屋 ${net.toFixed(1)} m²` : "按面积分摊",
      quantity: fix(purchased),
      unit: row.unit,
      price: row.price,
      subtotal: fix(purchased * (row.price ?? 0)),
    });
  }
  // 墙面：每间独立计算，已扣除对应门窗面积。
  for (const r of d.rooms) {
    if (r.counted === false) continue;
    const key = r.wallMat || "paint",
      surface = wallSurfaceArea(r, d);
    if (surface <= 0) continue;
    const price = priceOf(d, "wallPrices", key);
    byId.get(r.id)?.hard.push({
      group: "wallPrices",
      key,
      label: wallMaterialOf(d, key).name,
      note: "已扣除门窗",
      quantity: fix(surface),
      unit: "m²",
      price,
      subtotal: fix(surface * (price ?? 0)),
    });
  }
  // 屋面 / 吊顶：和地面一样归属本间；屋面按坡度换算斜面面积。
  for (const r of d.rooms) {
    const items: [PriceGroup, string | undefined, string, number, string | undefined][] = [
      ["roofPrices", r.roofMat, surfaceMaterialOf(d, "roof", r.roofMat || "")?.name || "屋面", roofSurfaceArea(r), r.roofSlope ? `坡度 ${r.roofSlope}° 换算` : "平顶"],
      ["ceilingPrices", r.ceilingMat, surfaceMaterialOf(d, "ceiling", r.ceilingMat || "")?.name || "吊顶", area(r), "按房间面积"],
    ];
    for (const [group, key, label, quantity, note] of items) {
      if (!key) continue;
      const price = priceOf(d, group, key);
      byId.get(r.id)?.hard.push({ group, key, label, note, quantity: fix(quantity), unit: "m²", price, subtotal: fix(quantity * (price ?? 0)) });
    }
  }
  // 门窗：贴到几间房就在几间之间平分；贴不到房间的留在公共项。
  for (const o of d.openings) {
    if (d.demolished.includes(o.wallId)) continue;
    const price = priceOf(d, "openingPrices", openingPriceKey(o)),
      netArea = openingDimensions(o, d).area,
      targets = d.rooms.filter((r) => openingRoomOverlap(r, o, d) > 1);
    const part = (share: number): CostPart => ({
      group: "openingPrices",
      key: openingPriceKey(o),
      label: openingName(d, o),
      note: targets.length > 1 ? `邻间平分 · 共 ${targets.length} 间` : undefined,
      quantity: fix(netArea * share),
      unit: "m²",
      price,
      subtotal: fix(netArea * share * (price ?? 0)),
    });
    if (!targets.length) shared.push(part(1));
    else
      for (const r of targets)
        byId.get(r.id)?.hard.push(part(1 / targets.length));
  }
  // 拆改与新建隔墙：跨房间施工，留在公共项。
  for (const row of c.hard.filter((r) => r.group === "constructionPrices"))
    shared.push({
      group: "constructionPrices",
      key: row.key,
      label: row.name,
      note: "全屋施工项",
      quantity: row.quantity,
      unit: row.unit,
      price: row.price,
      subtotal: row.subtotal,
    });
  // 人工：独立总价条目，留在公共项。
  for (const item of c.labor)
    shared.push({
      group: "labor",
      key: `labor:${item.id}`,
      refId: item.id,
      label: item.name,
      quantity: 1,
      unit: "元",
      price: item.amount,
      subtotal: item.amount,
    });
  // 家具：中心点落在哪间算哪间，房外家具进公共项并按同款合并；楼梯计入该间硬装。
  const outside = new Map<string, CostPart>();
  for (const f of d.furniture) {
    const key = furnitureKey(f),
      price = priceOf(d, "furniturePrices", key),
      owner = d.rooms.find((r) => inRoom([f.cx, f.cy], r));
    if (owner) {
      const room = byId.get(owner.id);
      (isStairs(f) ? room?.hard : room?.soft)?.push({
        group: "furniturePrices",
        key,
        label: f.name,
        quantity: 1,
        unit: "件",
        price,
        subtotal: fix(price ?? 0),
      });
      continue;
    }
    const old = outside.get(key);
    if (old) {
      old.quantity += 1;
      old.subtotal = fix(old.subtotal + (price ?? 0));
    } else
      outside.set(key, {
        group: "furniturePrices",
        key,
        label: f.name,
        note: "不在任何房间内",
        quantity: 1,
        unit: "件",
        price,
        subtotal: fix(price ?? 0),
      });
  }
  shared.push(...outside.values());
  const done = rooms.map(finalize),
    roomTotal = fix(done.reduce((s, r) => s + r.total, 0)),
    sharedTotal = fix(sum(shared)),
    // 完成度按全屋价格条目（同款/同材质为一项）统计，避免分摊碎片重复计数。
    rows = [...c.soft, ...c.hard].filter((r) => r.quantity > 0);
  return {
    rooms: done,
    shared,
    sharedTotal,
    hardTotal: fix(c.hardTotal),
    softTotal: fix(c.softTotal),
    total: fix(c.hardTotal + c.softTotal),
    roomTotal,
    unpriced: rows.filter((r) => r.price === null).length,
    pricedCount: rows.filter((r) => r.price !== null).length,
    priceableCount: rows.length,
  };
}
/** 选中对象在成本里的金额，供选中工具条与房间页显示。 */
export function selectionCost(
  d: Design,
  s: Selection,
): { label: string; amount: number | null; unit: string } | null {
  if (!s || s.kind === "group") return null;
  if (s.kind === "room") {
    const room = costBreakdown(d).rooms.find((r) => r.roomId === s.id);
    return room ? { label: "本间", amount: room.total, unit: "元" } : null;
  }
  if (s.kind === "furniture") {
    const f = d.furniture.find((f) => f.id === s.id);
    if (!f) return null;
    return {
      label: f.name,
      amount: priceOf(d, "furniturePrices", furnitureKey(f)),
      unit: "元/件",
    };
  }
  if (s.kind === "opening") {
    const o: Opening | undefined = d.openings.find((o) => o.id === s.id);
    if (!o) return null;
    const price = priceOf(d, "openingPrices", openingPriceKey(o)),
      netArea = openingDimensions(o, d).area;
    return {
      label: openingName(d, o),
      amount: price === null ? null : fix(netArea * price),
      unit: "m² × 元",
    };
  }
  const w = d.walls.find((w) => w.id === s.id);
  if (!w) return null;
  const demolished = d.demolished.includes(w.id);
  if (!demolished && (d.template !== "blank" || w.kind !== "partition"))
    return { label: "原始墙体", amount: 0, unit: "不计新建" };
  const price = priceOf(d, "constructionPrices", demolished ? "demolish" : "build"),
    surface = (Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * d.height) / 1e6;
  return {
    label: demolished ? "墙体拆除" : "新建隔墙",
    amount: price === null ? null : fix(surface * price),
    unit: "m² × 元",
  };
}
