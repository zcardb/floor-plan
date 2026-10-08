import { materials } from "../data/catalog";
import { validFurnitureType, validFurnitureOutline } from './furnitureAppearance';
import { referenceDesign } from "../data/templates";
import { length } from "./geometry";
import { validateProcurement } from "./materialProcurement";
import { normalizeFurniture, validPrice, wallMaterials } from "./costs";
import type { Design } from "./types";
const fail = () => {
  throw new Error("方案格式不正确或数据超出允许范围");
};
const finite = (v: unknown, min = -100000, max = 100000) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const point = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every((n) => finite(n));
export function validateDesign(value: unknown): Design {
  if (!value || typeof value !== "object") return fail();
  const v = value as Design;
  if (v.version !== 2) {
    const legacy = value as {
      furniture?: unknown[];
      rooms?: Record<string, { name: string; mat: string }>;
      demolished?: string[];
      measures?: { a: { x: number; y: number }; b: { x: number; y: number } }[];
    };
    if (!Array.isArray(legacy.furniture)) return fail();
    const base = referenceDesign();
    return validateDesign({
      ...base,
      furniture: legacy.furniture,
      rooms: base.rooms.map((r) => ({ ...r, ...legacy.rooms?.[r.id] })),
      demolished: legacy.demolished || [],
      measures: (legacy.measures || []).map((m, i) => ({
        id: "m" + i,
        a: [m.a.x, m.a.y],
        b: [m.b.x, m.b.y],
      })),
    });
  }
  if (
    !["blank", "reference"].includes(v.template) ||
    !finite(v.width, 500, 50000) ||
    !finite(v.depth, 500, 50000) ||
    !finite(v.thickness, 50, 1000) ||
    !finite(v.height, 1000, 8000)
  )
    return fail();
  for (const k of [
    "walls",
    "rooms",
    "openings",
    "furniture",
    "demolished",
    "measures",
  ] as const)
    if (!Array.isArray(v[k]) || v[k].length > 2000) return fail();
  if (!v.rooms.length || !v.walls.length) return fail();
  const ids = new Set<string>();
  const id = (s: string) => {
    if (typeof s !== "string" || !s.length || s.length > 100 || ids.has(s))
      fail();
    ids.add(s);
  };
  for (const w of v.walls) {
    id(w.id);
    if (
      !point(w.a) ||
      !point(w.b) ||
      !finite(w.thickness, 50, 1000) ||
      length(w) < 50 ||
      !["bearing", "exterior", "partition", "low"].includes(w.kind)
    )
      fail();
  }
  for (const r of v.rooms) {
    id(r.id);
    if (
      typeof r.name !== "string" ||
      r.name.length > 100 ||
      !materials[r.mat] ||
      !Array.isArray(r.rings) ||
      !r.rings.length ||
      r.rings.some(
        (p) =>
          !Array.isArray(p) ||
          p.length < 3 ||
          p.length > 1000 ||
          !p.every(point),
      )
    )
      fail();
  }
  if (v.customCatalog !== undefined) {
    if (!Array.isArray(v.customCatalog) || v.customCatalog.length > 500) fail();
    const catalogIds = new Set<string>();
    for (const item of v.customCatalog) {
      if (
        !item ||
        typeof item.catalogId !== "string" ||
        catalogIds.has(item.catalogId) ||
        item.catalogId.length > 250 ||
        typeof item.name !== "string" ||
        item.name.length > 100 ||
        typeof item.category !== "string" ||
        !validFurnitureType(item.type) ||
        !validFurnitureOutline(item.shape) ||
        !finite(item.w, 50, 20000) ||
        !finite(item.d, 50, 20000) ||
        !finite(item.height, 50, 8000) ||
        !/^#[0-9a-f]{6}$/i.test(item.color) ||
        (item.price !== undefined &&
          item.price !== null &&
          !validPrice(item.price)) ||
        (item.imageUrl !== undefined && !/^https:\/\//.test(item.imageUrl))
      )
        fail();
      catalogIds.add(item.catalogId);
    }
  }
  for (const f of v.furniture) {
    id(f.id);
    if (
      !validFurnitureType(f.type) ||
      !validFurnitureOutline(f.shape) ||
      typeof f.name !== "string" ||
      f.name.length > 100 ||
      !finite(f.cx) ||
      !finite(f.cy) ||
      !finite(f.w, 50, 20000) ||
      !finite(f.d, 50, 20000) ||
      !finite(f.rot, -36000, 36000) ||
      !/^#[0-9a-f]{6}$/i.test(f.color)
    )
      fail();
  }
  for (const o of v.openings) {
    id(o.id);
    const w = v.walls.find((w) => w.id === o.wallId);
    if (
      !w ||
      !["door", "window"].includes(o.kind) ||
      (o.hinge !== undefined && !['start', 'end'].includes(o.hinge)) ||
      (o.swingSide !== undefined && o.swingSide !== -1 && o.swingSide !== 1) ||
      !finite(o.width, 100, 10000) ||
      !finite(o.offset, 0) ||
      o.offset - o.width / 2 < -0.01 ||
      o.offset + o.width / 2 > length(w) + 0.01
    )
      fail();
  }
  for (let i = 0; i < v.openings.length; i++) {
    const a = v.openings[i];
    if (
      v.openings
        .slice(i + 1)
        .some(
          (b) =>
            b.wallId === a.wallId &&
            Math.abs(b.offset - a.offset) < (a.width + b.width) / 2,
        )
    )
      fail();
  }
  for (const m of v.measures) {
    id(m.id);
    if (!point(m.a) || !point(m.b)) fail();
  }
  for (const s of v.demolished) {
    const w = v.walls.find((w) => w.id === s);
    if (!w || !["partition", "low"].includes(w.kind)) fail();
  }
  for (const w of v.walls)
    if (w.color !== undefined && !/^#[0-9a-f]{6}$/i.test(w.color)) fail();
  for (const r of v.rooms)
    if (
      r.wallMat !== undefined &&
      !Object.prototype.hasOwnProperty.call(wallMaterials, r.wallMat)
    )
      fail();
  for (const o of v.openings)
    if (
      (o.height !== undefined && !finite(o.height, 100, 8000)) ||
      (o.sill !== undefined && !finite(o.sill, 0, 8000))
    )
      fail();
  for (const f of v.furniture)
    if (
      f.catalogId !== undefined &&
      (typeof f.catalogId !== "string" || f.catalogId.length > 250)
    )
      fail();
  for (const f of v.furniture)
    if (
      (f.height !== undefined && !finite(f.height, 50, 8000)) ||
      (f.imageUrl !== undefined && !/^https:\/\//.test(f.imageUrl))
    )
      fail();
  if (v.costSettings) {
    if (v.costSettings.procurement) {
      if (
        typeof v.costSettings.procurement !== "object" ||
        Array.isArray(v.costSettings.procurement)
      )
        fail();
      for (const [key, config] of Object.entries(v.costSettings.procurement)) {
        if (!materials[key]) fail();
        validateProcurement(config);
      }
    }
    if (typeof v.costSettings !== "object" || Array.isArray(v.costSettings))
      fail();
    for (const group of [
      "floorPrices",
      "wallPrices",
      "furniturePrices",
      "openingPrices",
      "constructionPrices",
    ] as const) {
      const prices = v.costSettings[group];
      if (prices !== undefined) {
        if (
          !prices ||
          typeof prices !== "object" ||
          Array.isArray(prices) ||
          Object.keys(prices).length > 2500
        )
          fail();
        for (const [key, price] of Object.entries(prices)) {
          if (key.length > 250 || (price !== null && !validPrice(price)))
            fail();
        }
      }
    }
    if (v.costSettings.labor !== undefined) {
      if (
        !Array.isArray(v.costSettings.labor) ||
        v.costSettings.labor.length > 500
      )
        fail();
      for (const item of v.costSettings.labor) {
        if (
          typeof item.id !== "string" ||
          typeof item.name !== "string" ||
          item.name.length > 100 ||
          !validPrice(item.amount)
        )
          fail();
      }
    }
  }
  return structuredClone({
    ...v,
    furniture: v.furniture.map(normalizeFurniture),
  });
}
