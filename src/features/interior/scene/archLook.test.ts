import { describe, expect, it } from "vitest";
import { designForTemplate } from "../data/templates";
import { DECOR_STYLES, decorStyleById } from "../model/decorStyles";
import type { Opening, Room, Wall } from "../model/types";
import { ENTRY_DOOR, WALL_CAP, WINDOW_FRAME, doorColor, isEntryDoor, wallColor } from "./archLook";

const room = (id: string, x: number, y: number, x2: number, y2: number): Room => ({
  id,
  name: id,
  mat: "wood",
  rings: [[[x, y], [x2, y], [x2, y2], [x, y2]]],
});
/** 一面 4 m 长、200 mm 厚的外围墙，墙中线在 y = 0；门在正中。 */
const wall: Wall = { id: "w", a: [0, 0], b: [4000, 0], thickness: 200, kind: "exterior" };
const door: Opening = { id: "d", wallId: "w", kind: "door", offset: 2000, width: 900 };
const inside = room("living", 0, 100, 4000, 3000);

describe("硬装 3D 配色", () => {
  it("墙面：单独刷过颜色的墙优先，其余跟风格", () => {
    const industrial = decorStyleById("industrial");
    expect(wallColor({ color: "#123456" }, industrial)).toBe("#123456");
    expect(wallColor({}, industrial)).toBe(industrial.wall);
    // 默认风格的墙色就是原来的暖灰
    expect(wallColor({}, decorStyleById(undefined))).toBe("#eee9de");
  });

  it("门扇：普通门跟风格，入户门固定用更深的胡桃色", () => {
    for (const style of DECOR_STYLES) {
      expect(doorColor(style, false), style.name).toBe(style.door);
      expect(doorColor(style, true), style.name).toBe(ENTRY_DOOR);
    }
    expect(ENTRY_DOOR).toBe("#6b4f3a");
    expect(WALL_CAP).toBe("#34312d");
    expect(WINDOW_FRAME).toEqual({ color: "#5d6166", roughness: 0.5, metalness: 0.4 });
  });

  it("入户门：外围墙上、一侧通向户外的平开门；阳台门、室内门、推拉门都不算", () => {
    expect(isEntryDoor(wall, door, [inside])).toBe(true);
    expect(isEntryDoor(wall, { ...door, doorType: "double" }, [inside])).toBe(true);
    // 门外是阳台（两侧都是房间）
    expect(isEntryDoor(wall, door, [inside, room("balcony", 0, -1500, 4000, -100)])).toBe(false);
    expect(isEntryDoor(wall, { ...door, doorType: "sliding" }, [inside])).toBe(false);
    expect(isEntryDoor({ ...wall, kind: "partition" }, door, [inside])).toBe(false);
    expect(isEntryDoor(wall, { ...door, kind: "window" }, [inside])).toBe(false);
    // 没有房间可判断时不当成入户门
    expect(isEntryDoor(wall, door, [])).toBe(false);
  });

  it("参考户型里只认出一扇入户门", () => {
    const d = designForTemplate("reference");
    const entries = d.openings.filter((o) => {
      const w = d.walls.find((w) => w.id === o.wallId);
      return !!w && isEntryDoor(w, o, d.rooms);
    });
    expect(entries).toHaveLength(1);
  });
});
