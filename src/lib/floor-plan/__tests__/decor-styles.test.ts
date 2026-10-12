import { describe, expect, it } from "vitest";
import {
  DECOR_STYLES,
  DEFAULT_DECOR_STYLE_ID,
  applyStyle,
  decorStyleById,
  designStyle,
  furnitureLook,
  furnitureMain,
  furnitureRole,
  isCustomStyleId,
  isDecorStyleId,
  matchStyle,
  newCustomStyleId,
  DECOR_CATEGORIES,
  styleSwatches,
  validDecorStyle,
  createCustomStyle,
  extractDesignColors,
  type DecorStyle,
} from "../decor-styles";
import { validateDesign } from "../validation";
import { designForTemplate } from "../templates";
import type { Furniture } from "../types";

const HEX = /^#[0-9a-f]{6}$/;
/** 默认配色与 19 个大类的基础款：最早的 20 套，id 不能变（已有方案在用）。 */
const BASE_IDS = ["default", "cream", "log", "modern", "simple", "nordic", "japanese", "wabi", "french", "midcentury", "luxury", "new-chinese", "american", "european", "neoclassical", "chinese", "mediterranean", "southeast-asian", "country", "industrial"];
const sofa: Furniture = { id: "f1", type: "sofa", name: "三人沙发", cx: 0, cy: 0, w: 2400, d: 900, rot: 0, color: "#b7c4b0" };
const fridge: Furniture = { ...sofa, id: "f2", type: "fridge", name: "冰箱", color: "#dfe4e8" };

describe("装修风格库", () => {
  it("内置 100 套，id 与名称都唯一，默认风格排第一且是唯一推荐项", () => {
    expect(DECOR_STYLES).toHaveLength(100);
    expect(new Set(DECOR_STYLES.map((s) => s.id)).size).toBe(DECOR_STYLES.length);
    expect(new Set(DECOR_STYLES.map((s) => s.name)).size).toBe(DECOR_STYLES.length);
    expect(DECOR_STYLES[0].id).toBe(DEFAULT_DECOR_STYLE_ID);
    expect(DECOR_STYLES.filter((s) => s.recommended).map((s) => s.id)).toEqual([DEFAULT_DECOR_STYLE_ID]);
  });

  it("19 个大类每类至少 4 套，除默认配色外都有大类；原有 20 个 id 全部保留", () => {
    for (const category of DECOR_CATEGORIES) expect(DECOR_STYLES.filter((s) => s.category === category).length, category).toBeGreaterThanOrEqual(4);
    for (const s of DECOR_STYLES) if (s.id !== DEFAULT_DECOR_STYLE_ID) expect(s.category, s.id).toBeDefined();
    expect(BASE_IDS.filter((id) => !isDecorStyleId(id))).toEqual([]);
    // 每个大类的基础款排在该类细分之前
    const order = DECOR_STYLES.map((s) => s.category);
    for (const category of DECOR_CATEGORIES) {
      const at = order.indexOf(category);
      expect(order.slice(at, order.lastIndexOf(category) + 1).every((c) => c === category), category).toBe(true);
    }
  });

  it("细分款的 7 个角色色都给全；所有风格名称不超过 6 个字，说明不超过 24 个字", () => {
    for (const s of DECOR_STYLES) {
      // 基础款允许缺省个别角色（用兜底色），细分款必须给全，保证同类之间的差异是明确设计出来的
      if (!BASE_IDS.includes(s.id)) expect(Object.keys(s.tone).sort(), s.id).toEqual(["bedding", "cabinetry", "lamp", "rug", "seating", "tabletop", "upholstery"]);
      expect(s.name.length, s.id).toBeLessThanOrEqual(6);
      expect(s.summary.length, s.id).toBeLessThanOrEqual(24);
      expect(s.category === undefined || DECOR_CATEGORIES.includes(s.category), s.id).toBe(true);
    }
  });

  it("所有颜色都是 6 位小写 HEX，名称与说明不为空", () => {
    for (const s of DECOR_STYLES) {
      for (const color of [s.wall, s.door, s.wood, s.legs, s.accent, ...Object.values(s.tone)]) expect(color).toMatch(HEX);
      expect(s.name.trim()).not.toBe("");
      expect(s.summary.trim()).not.toBe("");
      expect(s.softness).toBeGreaterThanOrEqual(0.8);
      expect(s.softness).toBeLessThanOrEqual(1.3);
      expect(styleSwatches(s)).toHaveLength(5);
    }
  });

  it("未知或缺省 id 回落到默认风格", () => {
    expect(decorStyleById(undefined).id).toBe(DEFAULT_DECOR_STYLE_ID);
    expect(decorStyleById("no-such-style").id).toBe(DEFAULT_DECOR_STYLE_ID);
    expect(decorStyleById("cream").name).toBe("奶油风");
    expect(isDecorStyleId("cream")).toBe(true);
    expect(isDecorStyleId("no-such-style")).toBe(false);
  });

  it("默认风格保留家具自己的颜色", () => {
    expect(furnitureLook(decorStyleById(DEFAULT_DECOR_STYLE_ID), sofa).main).toBe(sofa.color);
  });

  it("其它风格按家具角色改主色，没有角色的家电保持固有色", () => {
    const cream = decorStyleById("cream");
    expect(furnitureRole("sofa")).toBe("upholstery");
    expect(furnitureLook(cream, sofa).main).toBe(cream.tone.upholstery);
    expect(furnitureRole("fridge")).toBeUndefined();
    expect(furnitureLook(cream, fridge).main).toBe(fridge.color);
  });

  it("风格缺省某个角色时用兜底色，而不是家具自身颜色", () => {
    const modern = decorStyleById("modern");
    expect(modern.tone.lamp).toBeUndefined();
    const lamp = { ...sofa, type: "floorlamp", color: "#123456" };
    expect(furnitureLook(modern, lamp).main).not.toBe(lamp.color);
  });

  it("方案可以保存内置风格 id；未知风格不拒绝整个方案，清掉后按默认配色渲染", () => {
    const design = { ...designForTemplate("reference"), styleId: "industrial" };
    expect(validateDesign(design).styleId).toBe("industrial");
    const unknown = validateDesign({ ...design, styleId: "no-such-style" });
    expect(unknown.styleId).toBeUndefined();
    expect(designStyle(unknown).id).toBe(DEFAULT_DECOR_STYLE_ID);
  });
});

describe("自定义风格", () => {
  const mine = (): DecorStyle => ({ ...decorStyleById("cream"), id: "my-abc123def456", name: "我的奶油", summary: "基于奶油风", items: { sofa: "#7f9a7a" } });

  it("新 id 以 my- 开头且能通过校验，内置 id 不算自定义", () => {
    expect(isCustomStyleId(newCustomStyleId())).toBe(true);
    expect(isCustomStyleId("cream")).toBe(false);
    expect(validDecorStyle(mine())).toBe(true);
    expect(validDecorStyle({ ...mine(), id: "cream" })).toBe(false);
    expect(validDecorStyle({ ...mine(), wall: "red" })).toBe(false);
    expect(validDecorStyle({ ...mine(), items: { sofa: "#zzzzzz" } })).toBe(false);
    expect(validDecorStyle({ ...mine(), softness: 2 })).toBe(false);
  });

  it("套用自定义风格会把定义存进方案，换回内置风格时清掉", () => {
    const base = designForTemplate("reference");
    const applied = applyStyle(base, mine());
    expect(applied.styleId).toBe(mine().id);
    expect(designStyle(applied).name).toBe("我的奶油");
    expect(validateDesign(applied).customStyle?.name).toBe("我的奶油");
    expect(applyStyle(applied, decorStyleById("modern")).customStyle).toBeUndefined();
  });

  it("定义与 id 对不上或定义无效时，方案按默认配色渲染", () => {
    const base = designForTemplate("reference");
    expect(validateDesign({ ...base, styleId: "my-zzzzzzzzzzzz", customStyle: mine() }).styleId).toBeUndefined();
    expect(validateDesign({ ...base, styleId: mine().id, customStyle: { ...mine(), metal: "gold" } }).customStyle).toBeUndefined();
  });

  it("单件定色优先于角色配色；保留自身颜色的风格不改家具颜色", () => {
    expect(furnitureMain(mine(), sofa)).toBe("#7f9a7a");
    expect(furnitureMain(mine(), { ...sofa, type: "armchair" })).toBe(mine().tone.upholstery);
    expect(furnitureMain({ ...mine(), keep: true, items: {} }, sofa)).toBe(sofa.color);
  });

  it("新建风格：复制起点的全部取值、换新 id 与名称，不带推荐标记，并能通过校验", () => {
    const style = createCustomStyle({ base: decorStyleById(DEFAULT_DECOR_STYLE_ID), name: " 我家的配色 ", category: "现代" });
    expect(style.id).not.toBe(DEFAULT_DECOR_STYLE_ID);
    expect(isCustomStyleId(style.id)).toBe(true);
    expect(style).toMatchObject({ name: "我家的配色", category: "现代", keep: true, wall: decorStyleById(DEFAULT_DECOR_STYLE_ID).wall });
    expect(style.recommended).toBeUndefined();
    expect(validDecorStyle(style)).toBe(true);
  });

  it("从方案提取：每类家具取第一件的颜色，墙面取用得最多的墙色", () => {
    const design = designForTemplate("reference");
    const walls = design.walls.map((w, i) => ({ ...w, color: i < 2 ? "#dde4e0" : i < 3 ? "#f0e0d0" : undefined }));
    const extracted = extractDesignColors({ furniture: design.furniture, walls });
    expect(extracted.wall).toBe("#dde4e0");
    const firstSofa = design.furniture.find((f) => f.type === "sofa");
    if (firstSofa) expect(extracted.items.sofa).toBe(firstSofa.color);
    const style = createCustomStyle({ base: decorStyleById("modern"), name: "原木之家", design: { furniture: design.furniture, walls } });
    expect(style.wall).toBe("#dde4e0");
    expect(style.summary).toContain("从当前方案提取");
    expect(validDecorStyle(style)).toBe(true);
  });

  it("搜索匹配名称、说明与大类", () => {
    const cream = decorStyleById("cream");
    expect(matchStyle(cream, "奶油")).toBe(true);
    expect(matchStyle(cream, "  ")).toBe(true);
    expect(matchStyle(decorStyleById("industrial"), "奶油")).toBe(false);
  });
});
