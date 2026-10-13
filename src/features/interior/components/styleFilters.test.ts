import { describe, expect, it } from "vitest";
import { addCounts } from "@/lib/paging";
import { DECOR_CATEGORIES, DECOR_STYLES, decorStyleById, type DecorStyle } from "../model/decorStyles";
import { STYLE_ALL, STYLE_MINE, countStyles, filterStyleGroup, filterStyles, styleChips, styleCounts } from "./styleFilters";

const mine: DecorStyle[] = [{ ...decorStyleById("cream"), id: "my-abc123def456", name: "我家的奶油", summary: "自己调的" }];
const builtinCounts = countStyles(DECOR_STYLES, { mine: false });

describe("风格筛选", () => {
  it("分类条：全部 →（有自建风格才有）我的 → 各大类，数量两组相加", () => {
    const guest = styleChips(builtinCounts);
    expect(guest.map((c) => c.id)).toEqual([STYLE_ALL, ...DECOR_CATEGORIES]);
    expect(guest[0]!.meta).toBe(String(DECOR_STYLES.length));
    const signedIn = styleChips(addCounts(countStyles(mine, { mine: true }), builtinCounts));
    expect(signedIn.slice(0, 2).map((c) => [c.id, c.meta])).toEqual([[STYLE_ALL, String(DECOR_STYLES.length + 1)], [STYLE_MINE, "1"]]);
    const cream = (chips: typeof guest) => Number(chips.find((c) => c.id === "奶油")!.meta);
    expect(cream(signedIn)).toBe(cream(guest) + 1);
  });

  it("数据库返回的分类数量：未归类计在空串下，只算进「全部」「我的」，不单独成胶囊", () => {
    const counts = styleCounts({ 奶油: 2, "": 1 }, { mine: true });
    expect(counts).toMatchObject({ [STYLE_ALL]: 3, [STYLE_MINE]: 3, 奶油: 2 });
    expect(styleChips(counts).map((c) => c.id)).toEqual([STYLE_ALL, STYLE_MINE, "奶油"]);
  });

  it("按大类筛选，自建风格排在前面；「我的」只看自建，内置一组为空", () => {
    const cream = filterStyles(DECOR_STYLES, mine, { query: "", category: "奶油" });
    expect(cream[0]!.id).toBe(mine[0]!.id);
    expect(cream.every((s) => s.category === "奶油")).toBe(true);
    expect(filterStyles(DECOR_STYLES, mine, { query: "", category: STYLE_MINE })).toEqual(mine);
    expect(filterStyleGroup(DECOR_STYLES, { query: "", category: STYLE_MINE }, { mine: false })).toEqual([]);
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
