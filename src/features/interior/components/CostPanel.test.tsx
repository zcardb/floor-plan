import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { blankDesign, referenceDesign } from "../data/templates";
import { costBreakdown } from "../model/costBreakdown";
import { setPrice } from "../model/costs";
import { yuan } from "../model/money";
import type { Design, Selection } from "../model/types";
import { CostPanel } from "./CostPanel";
import { PanelModeTabs } from "./PanelModeTabs";

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
  it("未选中时显示全屋口径：硬装主数字、明细分组与按房间列表", () => {
    const d = setPrice(referenceDesign(), "floorPrices", "wood", 200),
      b = costBreakdown(d),
      out = html(d);
    expect(out).toContain("全屋成本");
    expect(out).toContain(yuan(b.hardTotal));
    expect(out).toContain("按房间");
    expect(out).toContain("全屋公共项");
    for (const room of d.rooms) expect(out).toContain(room.name);
  });
  it("软装未定价时显示「未定价」而不是 ¥0", () => {
    const d = referenceDesign();
    expect(d.furniture.length).toBeGreaterThan(0);
    const out = html(d);
    expect(out).toMatch(/软装 <b class="is-muted">未定价 \d+ 项<\/b>/);
    expect(out).toContain("只看未定价");
  });
  it("选中房间时切到房间口径，只列本间项目", () => {
    const d = referenceDesign(),
      room = d.rooms[0],
      other = d.rooms.find((r) => r.id !== room.id)!,
      out = html(d, { kind: "room", id: room.id });
    expect(out).toContain("房间口径");
    expect(out).toContain(room.name);
    expect(out).toContain("占全屋");
    expect(out).not.toContain("按房间");
    expect(out).not.toContain(">" + other.name + "<");
  });
  it("选中房内家具时进入其房间口径并高亮该行", () => {
    const d = referenceDesign(),
      f = d.furniture[0],
      out = html(d, { kind: "furniture", id: f.id });
    expect(out).toContain("房间口径");
    expect(out).toContain("is-highlight");
  });
  it("空项目打开成本页不报错，显示空状态", () => {
    const d = blankDesign();
    d.rooms = [];
    d.furniture = [];
    const out = html(d);
    expect(out).toContain("全屋成本");
    expect(out).toContain(yuan(0));
  });
});
describe("面板模式标签", () => {
  it("成本标签常驻全屋总额，有未定价项时带提示点", () => {
    const d = referenceDesign(),
      out = renderToStaticMarkup(
        <PanelModeTabs design={d} mode="props" onChange={vi.fn()} />,
      );
    expect(out).toContain("属性");
    expect(out).toContain(yuan(costBreakdown(d).total));
    expect(out).toContain("panel-mode-dot");
  });
});
