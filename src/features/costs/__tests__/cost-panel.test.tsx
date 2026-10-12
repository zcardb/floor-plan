import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { blankDesign, referenceDesign } from "@/lib/floor-plan/templates";
import { costBreakdown } from "@/lib/floor-plan/cost-breakdown";
import { setPrice } from "@/lib/floor-plan/costs";
import { yuan } from "@/lib/floor-plan/money";
import type { Design, Selection } from "@/lib/floor-plan/types";
import { CostPanel } from "../components/cost-panel";

const html = (design: Design, selection: Selection = null) =>
  renderToStaticMarkup(
    <CostPanel
      design={design}
      selection={selection}
      change={vi.fn()}
      back={vi.fn()}
      select={vi.fn()}
    />,
  );
describe("成本页口径", () => {
  it("未选中时显示全屋口径：合计 → 定价 → 明细 → 按房间 → 计算口径，不再有口径标题与返回", () => {
    const d = setPrice(referenceDesign(), "floorPrices", "wood", 200),
      b = costBreakdown(d),
      out = html(d);
    // 顶部只有一个焦点数字 + 硬装 / 软装，不再有「全屋成本 · N 个空间」「全屋合计 · 硬装 + 软装」
    for (const gone of ["全屋成本", "全屋合计", "个空间", "返回方案总览", "panel-heading"]) expect(out).not.toContain(gone);
    expect(out.indexOf("cost-summary")).toBeLessThan(out.indexOf("cost-pricing"));
    expect(out.indexOf("cost-pricing")).toBeLessThan(out.indexOf("明细"));
    expect(out.indexOf("明细")).toBeLessThan(out.indexOf("按房间"));
    expect(out.indexOf("按房间")).toBeLessThan(out.indexOf("计算口径"));
    expect(out).toContain(`<strong>${yuan(b.total)}</strong>`);
    expect(out).toContain(`硬装</dt><dd>${yuan(b.hardTotal)}</dd>`);
    expect(out).toContain("按房间");
    expect(out).toContain("全屋公共项");
    for (const room of d.rooms) expect(out).toContain(room.name);
  });
  it("软装未定价时显示「未定价」而不是 ¥0", () => {
    const d = referenceDesign();
    expect(d.furniture.length).toBeGreaterThan(0);
    const out = html(d);
    expect(out).toMatch(/软装<\/dt><dd class="is-muted">未定价 \d+ 项<\/dd>/);
    expect(out).toContain("只看未定价");
  });
  it("选中房间时切到房间口径，只列本间项目", () => {
    const d = referenceDesign(),
      room = d.rooms[0],
      other = d.rooms.find((r) => r.id !== room.id)!,
      out = html(d, { kind: "room", id: room.id });
    expect(out).toMatch(/class="back-link"[^>]*>.*全屋成本<\/button>/);
    expect(out).toContain(`<h3>${room.name}</h3>`);
    expect(out).toContain("占全屋");
    expect(out).not.toContain("按房间");
    expect(out).not.toContain(">" + other.name + "<");
  });
  it("选中房内家具时进入其房间口径并高亮该行", () => {
    const d = referenceDesign(),
      f = d.furniture[0],
      out = html(d, { kind: "furniture", id: f.id });
    expect(out).toMatch(/class="back-link"[^>]*>.*全屋成本<\/button>/);
    expect(out).toContain("is-highlight");
  });
  it("空项目打开成本页不报错，显示空状态", () => {
    const d = blankDesign();
    d.rooms = [];
    d.furniture = [];
    const out = html(d);
    expect(out).toContain(`<strong>${yuan(0)}</strong>`);
  });
});
describe("成本页定价分组", () => {
  it("全部定价后只剩进度与完成提示，不再显示「只看未定价」", () => {
    const d = blankDesign();
    d.rooms = [];
    d.furniture = [];
    const out = html(d);
    expect(out).toContain("全部项目已定价");
    expect(out).not.toContain("只看未定价");
  });
});
