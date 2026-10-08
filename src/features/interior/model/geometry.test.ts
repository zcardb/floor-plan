import { describe, it, expect } from "vitest";
import { blankDesign, referenceDesign } from "../data/templates";
import {
  area,
  center,
  inRoom,
  length,
  rebuildRooms,
  rect,
  resizeBlank,
  snapMove,
} from "./geometry";
import { validateDesign } from "./validation";
import { materials } from "../data/catalog";
describe("户型几何与输入保护", () => {
  it("空白方案具有四周墙且无家具", () => {
    const d = blankDesign();
    expect(d.walls).toHaveLength(4);
    expect(d.furniture).toHaveLength(0);
    expect(area(d.rooms[0])).toBe(36);
    expect(d.height).toBe(2800);
  });
  it("修改净尺寸保持墙厚且正确计算净面积", () => {
    const d = resizeBlank(blankDesign(), 8000, 5000, 300);
    expect(area(d.rooms[0])).toBe(40);
    expect(d.walls.every((w) => w.thickness === 300)).toBe(true);
  });
  it("贯穿隔墙划分两个净房间，未闭合墙不伪造房间", () => {
    const base = blankDesign(),
      wall = {
        id: "testwall",
        a: [3000, -120] as [number, number],
        b: [3000, 6120] as [number, number],
        thickness: 240,
        kind: "partition" as const,
      };
    const split = rebuildRooms({ ...base, walls: [...base.walls, wall] });
    expect(split.rooms).toHaveLength(2);
    expect(split.rooms.reduce((s, r) => s + area(r), 0)).toBeCloseTo(34.56);
    const unfinished = rebuildRooms({
      ...base,
      walls: [...base.walls, { ...wall, b: [3000, 3000] }],
    });
    expect(unfinished.rooms).toHaveLength(1);
  });
  it('连接轮廓闭合形成房间，保存往返不改中心线', () => {
    const base = blankDesign();
    const points: [number, number][] = [[1000, 1000], [3000, 1000], [3000, 3000], [1000, 3000]];
    const walls = points.map((a, i) => ({ id: `closed-${i}`, a, b: points[(i + 1) % 4], thickness: 200, kind: 'partition' as const }));
    const design = rebuildRooms({ ...base, walls: [...base.walls, ...walls] });
    expect(design.rooms).toHaveLength(2);
    expect(design.rooms.some(r => Math.abs(area(r) - 3.24) < 0.001)).toBe(true);
    const restored = validateDesign(JSON.parse(JSON.stringify(design)));
    expect(restored.walls).toEqual(design.walls);
    expect(rebuildRooms(restored).rooms).toHaveLength(2);
  });
  it("房间拆分保留原房间ID且不产生重复ID", () => {
    const d = blankDesign(),
      s = rebuildRooms({
        ...d,
        walls: [
          ...d.walls,
          {
            id: "cross",
            a: [0, 3000],
            b: [6000, 3000],
            thickness: 240,
            kind: "partition",
          },
        ],
      });
    expect(s.rooms.some((r) => r.id === d.rooms[0].id)).toBe(true);
    expect(new Set(s.rooms.map((r) => r.id)).size).toBe(s.rooms.length);
  });
  it("异形房间中心落在内部且洞内不算室内", () => {
    const r = {
      id: "r",
      name: "test",
      mat: "wood",
      rings: [rect(0, 0, 5000, 5000), rect(1000, 1000, 1000, 1000)],
    };
    expect(inRoom([1500, 1500], r)).toBe(false);
    expect(inRoom(center(r), r)).toBe(true);
    expect(area(r)).toBe(24);
  });
  it("参考方案可校验且飘窗被排除在套内面积外", () => {
    const d = validateDesign(referenceDesign());
    const all = d.rooms.reduce((s, r) => s + area(r), 0),
      net = d.rooms
        .filter((r) => r.counted !== false)
        .reduce((s, r) => s + area(r), 0);
    expect(all).toBeGreaterThan(net);
    expect(d.furniture).toHaveLength(46);
    expect(
      d.rooms.reduce((s, r) => s + area(r) * materials[r.mat].price * 1.05, 0),
    ).toBeGreaterThan(0);
  });
  it("非法尺寸、NaN、越权拆除及越界开口被拒绝", () => {
    for (const patch of [
      { width: -1 },
      { height: NaN },
      { demolished: ["outer-0"] },
      {
        openings: [
          { id: "o", wallId: "outer-0", kind: "door", offset: 0, width: 900 },
        ],
      },
    ])
      expect(() => validateDesign({ ...blankDesign(), ...patch })).toThrow();
  });
  it("JSON往返与旧参考JSON升级", () => {
    const d = referenceDesign();
    expect(validateDesign(JSON.parse(JSON.stringify(d)))).toEqual(
      validateDesign(d),
    );
    const old = {
      furniture: d.furniture,
      rooms: Object.fromEntries(
        d.rooms.map((r) => [r.id, { name: r.name, mat: r.mat }]),
      ),
      demolished: [],
    };
    expect(validateDesign(old).version).toBe(2);
  });
  it("关闭贴墙吸附仍保留10mm网格", () => {
    const d = blankDesign(),
      f = {
        id: "f",
        type: "table",
        name: "桌",
        cx: 0,
        cy: 0,
        w: 1000,
        d: 500,
        rot: 0,
        color: "#d8b88a",
      };
    expect(snapMove(f, [151, 162], d, false)).toEqual([150, 160]);
    expect(length(d.walls[0])).toBe(6240);
  });
});
