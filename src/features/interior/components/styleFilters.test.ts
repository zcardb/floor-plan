import { describe, expect, it } from "vitest";
import { DECOR_CATEGORIES, DECOR_STYLES, decorStyleById, type DecorStyle } from "../model/decorStyles";
import { STYLE_ALL, STYLE_MINE, filterStyles, styleChips } from "./styleFilters";

const mine: DecorStyle[] = [{ ...decorStyleById("cream"), id: "my-abc123def456", name: "我家的奶油", summary: "自己调的" }];

describe("风格筛选", () => {
  it("分类条：全部 →（有自建风格才有）我的 → 各大类，数量含自建风格", () => {
    const guest = styleChips(DECOR_STYLES, []);
    expect(guest.map((c) => c.id)).toEqual([STYLE_ALL, ...DECOR_CATEGORIES]);
    expect(guest[0]!.meta).toBe(String(DECOR_STYLES.length));
    const signedIn = styleChips(DECOR_STYLES, mine);
    expect(signedIn.slice(0, 2).map((c) => [c.id, c.meta])).toEqual([[STYLE_ALL, String(DECOR_STYLES.length + 1)], [STYLE_MINE, "1"]]);
    const cream = (chips: typeof guest) => Number(chips.find((c) => c.id === "奶油")!.meta);
    expect(cream(signedIn)).toBe(cream(guest) + 1);
  });

  it("按大类筛选，自建风格排在前面；「我的」只看自建", () => {
    const cream = filterStyles(DECOR_STYLES, mine, { query: "", category: "奶油" });
    expect(cream[0]!.id).toBe(mine[0]!.id);
    expect(cream.every((s) => s.category === "奶油")).toBe(true);
    expect(filterStyles(DECOR_STYLES, mine, { query: "", category: STYLE_MINE })).toEqual(mine);
    expect(filterStyles(DECOR_STYLES, mine, { query: "", category: STYLE_ALL })).toHaveLength(DECOR_STYLES.length + 1);
  });

  it("有关键词时在全部风格里搜，忽略当前分类", () => {
    const found = filterStyles(DECOR_STYLES, mine, { query: "胡桃", category: "奶油" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((s) => s.category !== "奶油")).toBe(true);
    expect(found.every((s) => [s.name, s.summary, s.category ?? ""].some((field) => field.includes("胡桃")))).toBe(true);
    expect(filterStyles(DECOR_STYLES, mine, { query: "不存在的风格", category: STYLE_ALL })).toEqual([]);
  });
});
