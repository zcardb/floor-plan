import { describe, expect, it } from "vitest";
import { buildPlan, libraryResolver, type PlanSpec } from "../data/floorplanBuilder";
import type { Design, Furniture, Room } from "./types";
import { backingOf, furnitureHeight, passageBlocker, roomLayout, settleFurniture, violationsOf, type RoomLayout } from "./layoutRules";

/**
 * 你描述的场景：客厅 6000×5000 与右侧 2000 宽的阳台之间没有墙（开间），
 * 客厅左、上是实墙，下边一扇 2000 宽的窗。
 */
const living = (): Design => {
  const spec: PlanSpec = {
    id: "layout-rules",
    width: 8000,
    depth: 5000,
    walls: [],
    rooms: [
      { id: "hall", name: "客厅", mat: "wood", poly: [[0, 0], [6000, 0], [6000, 5000], [0, 5000]] },
      { id: "balcony", name: "阳台", mat: "tile600", poly: [[6000, 0], [8000, 0], [8000, 5000], [6000, 5000]] },
    ],
    openings: [{ wall: "bottom", kind: "window", at: 3000, width: 2000 }],
    furniture: [],
  };
  return buildPlan(spec, libraryResolver);
};

const roomOf = (d: Design, name: string): Room => d.rooms.find((r) => r.name.includes(name))!;

const item = (type: string, name: string, cx: number, cy: number, w: number, d: number, rot: number, height?: number): Furniture => ({
  id: `${type}-${cx}-${cy}`, type, name, cx, cy, w, d, rot, color: "#ccc", ...(height ? { height } : {}),
});

/** 家具是否违反某一类约束。 */
const kinds = (f: Furniture, layout: RoomLayout) => violationsOf(f, layout).map((v) => v.kind);

describe("房间每条边背后的构造", () => {
  const d = living();
  const room = roomOf(d, "客厅");
  const layout = roomLayout(d, room);

  it("通向阳台的开间那一侧整段是 open，不是墙", () => {
    const right = layout.edges.filter((e) => e.side === "right");
    expect(right).toHaveLength(1);
    expect(right[0]!.spans.map((s) => s.kind)).toEqual(["open"]);
  });

  it("左边整段是实墙", () => {
    const left = layout.edges.find((e) => e.side === "left")!;
    expect(left.spans.map((s) => s.kind)).toEqual(["wall"]);
  });

  it("下边窗洞那一段标成 window", () => {
    const down = layout.edges.find((e) => e.side === "down")!;
    expect(down.spans.some((s) => s.kind === "window")).toBe(true);
  });

  it("窗前区与门前通行区都建出来了", () => {
    expect(layout.keepOuts.some((k) => k.kind === "window")).toBe(true);
  });
});

describe("背靠面：柜类必须背靠实墙", () => {
  const d = living();
  const room = roomOf(d, "客厅");
  const layout = roomLayout(d, room);
  const [x1, y1, x2, y2] = layout.room.rings[0]!.reduce(
    ([ax, ay, bx, by], [x, y]) => [Math.min(ax, x), Math.min(ay, y), Math.max(bx, x), Math.max(by, y)],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  it("矮家具不因窗前区被拦，高柜会被拦", () => {
    const desk = item("desk", "书桌", 3000, 4600, 1200, 600, 180, 750);
    const wardrobe = item("wardrobe", "衣柜", 3000, 4600, 1200, 600, 180, 2000);
    expect(kinds(desk, layout)).not.toContain("window");
    expect(kinds(wardrobe, layout)).toContain("window");
  });

  it("衣柜靠右侧开间那一侧时，背靠面报开敞且提示没有实墙", () => {
    const f = item("wardrobe", "衣柜", x2 - 300, (y1 + y2) / 2, 600, 600, 90, 2000);
    const violation = violationsOf(f, layout).find((v) => v.kind === "backing");
    expect(violation).toBeDefined();
    expect(["open", "none"]).toContain(violation!.other);
  });

  it("同一件衣柜改靠左侧实墙后不再报背靠违规", () => {
    const f = item("wardrobe", "衣柜", x1 + 300, (y1 + y2) / 2, 600, 600, 270, 2000);
    expect(kinds(f, layout)).not.toContain("backing");
  });

  it("沙发不要求背靠实墙（靠不靠墙由模型判断，不做硬拦截）", () => {
    const f = item("sofa", "三人沙发", (x1 + x2) / 2, (y1 + y2) / 2, 2200, 900, 0);
    expect(kinds(f, layout)).not.toContain("backing");
  });

  it("背靠面覆盖率：实墙覆盖超过 70% 通过，低于 70% 报违规", () => {
    const solid = item("wardrobe", "衣柜", 3000, y1 + 300, 2000, 600, 0, 2000);
    expect(backingOf(layout.edges, solid).ratio).toBeGreaterThanOrEqual(0.7);
    const offWall = item("wardrobe", "衣柜", 3000, y1 + 800, 2000, 600, 0, 2000);
    expect(backingOf(layout.edges, offWall).ratio).toBe(0);
  });
});

describe("落库前的确定性校正", () => {
  const d = living();
  const room = roomOf(d, "客厅");
  const layout = roomLayout(d, room);
  const [x1, y1, x2, y2] = layout.room.rings[0]!.reduce(
    ([ax, ay, bx, by], [x, y]) => [Math.min(ax, x), Math.min(ay, y), Math.max(bx, x), Math.max(by, y)],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  it("背靠开间的衣柜被挪到有实墙的位置，并记一条已微调", () => {
    const bad = item("wardrobe", "衣柜", x2 - 300, (y1 + y2) / 2, 600, 600, 90, 2000);
    const { furniture, report } = settleFurniture([bad], layout);
    expect(report.adjusted).toHaveLength(1);
    expect(report.adjusted[0]).toContain("衣柜");
    expect(report.adjusted[0]).toContain("实墙");
    expect(kinds(furniture[0]!, layout)).not.toContain("backing");
  });

  it("已经合规的家具原样保留，不产生微调记录", () => {
    const good = item("sofa", "三人沙发", (x1 + x2) / 2, (y1 + y2) / 2, 2200, 900, 0);
    const { furniture, report } = settleFurniture([good], layout);
    expect(report.adjusted).toHaveLength(0);
    expect(furniture[0]!.cx).toBe(good.cx);
    expect(furniture[0]!.cy).toBe(good.cy);
  });

  it("跨到房间轮廓之外的家具被收回房间内", () => {
    const outside = item("chair", "餐椅", x2 + 2000, (y1 + y2) / 2, 450, 480, 0);
    const { furniture, report } = settleFurniture([outside], layout);
    expect(report.adjusted).toHaveLength(1);
    expect(kinds(furniture[0]!, layout)).not.toContain("bounds");
  });
});

describe("过道连通：门口被挡住要报出来", () => {
  it("两个门口的通道被大衣柜堵死时报出这件家具", () => {
    const spec: PlanSpec = {
      id: "passage",
      width: 6000,
      depth: 5000,
      walls: [],
      rooms: [{ id: "hall", name: "客厅", mat: "wood", poly: [[0, 0], [6000, 0], [6000, 5000], [0, 5000]] }],
      openings: [
        { wall: "left", kind: "door", at: 1000, width: 900, into: "right", hinge: "start" },
        { wall: "right", kind: "door", at: 1000, width: 900, into: "left", hinge: "start" },
      ],
      furniture: [],
    };
    const d = buildPlan(spec, libraryResolver);
    const room = roomOf(d, "客厅");
    const layout = roomLayout(d, room);
    expect(layout.doors.length).toBe(2);
    // 房间中间竖着一整排衣柜（上下贯通），两个门之间走不通。
    const wallOfFurniture = item("wardrobe", "一排衣柜", 3000, 2500, 5000, 600, 90, 2000);
    expect(passageBlocker([wallOfFurniture], layout)?.name).toBe("一排衣柜");
    // 只在下端留 500 宽的缝：不够一个人通过，仍然报。
    const almost = item("wardrobe", "几乎一堵墙", 3000, 2250, 4500, 600, 90, 2000);
    expect(passageBlocker([almost], layout)?.name).toBe("几乎一堵墙");
    // 留出 800 宽的通道后不再报。
    const passable = item("wardrobe", "留了过道", 3000, 2100, 4200, 600, 90, 2000);
    expect(passageBlocker([passable], layout)).toBeNull();
  });
});

describe("高度缺省值", () => {
  it("目录没给高度时按类型取典型值，未知类型按 700", () => {
    expect(furnitureHeight({ type: "wardrobe" })).toBe(2000);
    expect(furnitureHeight({ type: "rug" })).toBe(700);
    expect(furnitureHeight({ type: "wardrobe", height: 2400 })).toBe(2400);
  });
});

describe("门扇开启范围", () => {
  it("开向本房间的平开门产生扫掠区，压在里面的家具会被报出", () => {
    const spec: PlanSpec = {
      id: "sweep",
      width: 4000,
      depth: 4000,
      walls: [],
      rooms: [{ id: "bed", name: "卧室", mat: "wood", poly: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]] }],
      openings: [{ wall: "left", kind: "door", at: 1000, width: 900, into: "right", hinge: "start" }],
      furniture: [],
    };
    const d = buildPlan(spec, libraryResolver);
    const layout = roomLayout(d, roomOf(d, "卧室"));
    expect(layout.keepOuts.some((k) => k.kind === "doorSweep")).toBe(true);
    // 门扇半径 900：门边 400×400 的床头柜在扫掠区内。
    const blocked = item("nightstand", "床头柜", 300, 1000, 400, 400, 270);
    expect(kinds(blocked, layout)).toEqual(expect.arrayContaining(["doorSweep"]));
    // 地毯可以压在门扇下。
    const rug = item("rug", "地毯", 500, 1000, 600, 600, 0);
    expect(kinds(rug, layout)).not.toContain("doorSweep");
  });
});
