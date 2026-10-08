import { library } from "./catalog";
import { outerWalls, rect } from "../model/geometry";
import {
  uid,
  type Design,
  type Furniture,
  type Point,
  type Project,
  type Wall,
} from "../model/types";
const walls: [number, number, number, number, string][] = [
  [1580, -240, 2120, 0, "b"],
  [1580, 0, 1820, 300, "b"],
  [2120, -240, 4580, 0, "e"],
  [4580, -240, 5140, 0, "e"],
  [5760, -240, 6050, 0, "e"],
  [6050, -240, 6600, 0, "b"],
  [6360, 0, 6600, 300, "b"],
  [6600, -240, 9960, 0, "e"],
  [9960, -240, 10510, 0, "b"],
  [10270, 0, 10510, 300, "b"],
  [10270, 300, 10510, 800, "e"],
  [10270, 2600, 10510, 3090, "e"],
  [10270, 3090, 10510, 4260, "b"],
  [10270, 5740, 10510, 6370, "b"],
  [9960, 6370, 10510, 6610, "b"],
  [10270, 6610, 10510, 7400, "b"],
  [10270, 9770, 10510, 10560, "b"],
  [9960, 10560, 10510, 10800, "b"],
  [4580, 10560, 9960, 10800, "e"],
  [10510, 10560, 12090, 10800, "e"],
  [11850, 9960, 12090, 10560, "e"],
  [4580, 9200, 4820, 10560, "e"],
  [4580, 7960, 4820, 8310, "e"],
  [3620, 7960, 4580, 8200, "e"],
  [2180, 7960, 3620, 8200, "b"],
  [2180, 7590, 2420, 7960, "b"],
  [2180, 7400, 2420, 7590, "n"],
  [-240, 7960, 2180, 8200, "e"],
  [-240, 3610, 0, 7960, "e"],
  [0, 4950, 200, 5190, "n"],
  [200, 4950, 1275, 5190, "low"],
  [1580, 3370, 2420, 3825, "b"],
  [2180, 4430, 2420, 5796, "n"],
  [2090, 4950, 2180, 5190, "n"],
  [2420, 4950, 4580, 5190, "n"],
  [4580, 3280, 4820, 4075, "n"],
  [4580, 4860, 4820, 5190, "n"],
  [2420, 3370, 4580, 3610, "n"],
  [4580, 0, 4820, 2400, "n"],
  [4820, 2080, 6360, 2320, "n"],
  [6360, 300, 6600, 1198, "n"],
  [6360, 1983, 6600, 2400, "n"],
  [6083, 3370, 6600, 3707, "b"],
  [6360, 3280, 6600, 3370, "n"],
  [6600, 3370, 9960, 3610, "n"],
  [9960, 3370, 10270, 3610, "b"],
  [6083, 4600, 6323, 6610, "n"],
  [6323, 6370, 9960, 6610, "n"],
];
const windows = [
  [5140, -240, 5760, 0],
  [1580, 300, 1820, 3370],
  [-240, 3370, 1580, 3610],
  [2180, 3825, 2420, 4430],
  [10510, 6370, 12090, 6610],
  [11850, 6610, 12090, 9960],
  [10510, 660, 11130, 760],
  [11030, 760, 11130, 2650],
  [10510, 2650, 11130, 2750],
  [10510, 4110, 11130, 4210],
  [11030, 4210, 11130, 5785],
  [10510, 5785, 11130, 5885],
];
const doors = [
  [4580, 2400, 4820, 3280],
  [6360, 2400, 6600, 3280],
  [6360, 1198, 6600, 1983],
  [4580, 4075, 4820, 4860],
  [6083, 3707, 6323, 4600],
  [4580, 8310, 4820, 9200],
  [10270, 7400, 10510, 9770],
  [1275, 4950, 2090, 5190],
];
export function fromRect(r: number[], id: string, kind: Wall["kind"]): Wall {
  const [x, y, x2, y2] = r,
    h = x2 - x >= y2 - y;
  return {
    id,
    kind,
    a: h ? [x, (y + y2) / 2] : [(x + x2) / 2, y],
    b: h ? [x2, (y + y2) / 2] : [(x + x2) / 2, y2],
    thickness: h ? y2 - y : x2 - x,
  };
}
export function defaultFurniture(): Furniture[] {
  const f = (
    type: string,
    name: string,
    cx: number,
    cy: number,
    w: number,
    d: number,
    rot = 0,
    color?: string,
  ): Furniture => ({
    id: uid(),
    type,
    name,
    cx,
    cy,
    w,
    d,
    rot,
    color: color || library.find((i) => i.type === type)?.color || "#e8dccb",
  });
  return [
    f("bed", "双人床", 8300, 1000, 1800, 2000, 0, "#c9d6df"),
    f("nightstand", "床头柜", 7150, 220, 450, 400),
    f("nightstand", "床头柜", 9450, 220, 450, 400),
    f("wardrobe", "衣柜", 8800, 3070, 2400, 600, 180),
    f("baycushion", "飘窗垫", 10770, 1705, 520, 1800),
    f("shower", "淋浴房", 5270, 450, 900, 900),
    f("toilet", "马桶", 5170, 1500, 400, 700, 270),
    f("vanity", "浴室柜", 6110, 700, 800, 500, 90),
    f("bed", "单人床", 2420, 1000, 1200, 2000, 0, "#e8d5b5"),
    f("desk", "书桌", 2120, 2700, 1200, 600, 270),
    f("chair", "椅子", 2700, 2700, 450, 480, 90),
    f("wardrobe", "衣柜", 4280, 1000, 1600, 600, 90),
    f("bookshelf", "书架", 3500, 150, 800, 300),
    f("shower", "淋浴区", 2870, 4280, 900, 1340),
    f("toilet", "马桶", 3560, 3960, 400, 700),
    f("vanity", "浴室柜", 4150, 3850, 700, 480),
    f("washer", "洗衣机", 300, 3960, 600, 600, 270),
    f("vanity", "洗衣池", 250, 4600, 600, 500, 270),
    f("counter", "橱柜台面", 300, 6575, 2770, 600, 270),
    f("counter", "橱柜台面", 1390, 7660, 1580, 600, 180),
    f("stove", "燃气灶", 300, 6200, 750, 450, 270),
    f("ksink", "水槽", 1400, 7680, 800, 450, 180),
    f("fridge", "冰箱", 2770, 5540, 700, 700),
    f("table", "餐桌", 3600, 6650, 1400, 800, 90),
    f("chair", "餐椅", 2940, 6320, 450, 480, 270),
    f("chair", "餐椅", 2940, 6980, 450, 480, 270),
    f("chair", "餐椅", 4260, 6320, 450, 480, 90),
    f("chair", "餐椅", 4260, 6980, 450, 480, 90),
    f("cabinet", "餐边柜", 3500, 7785, 1600, 350, 180),
    f("rug", "地毯", 7600, 8950, 2600, 1800),
    f("tvstand", "电视柜", 7600, 6810, 2400, 400),
    f("sofa", "三人沙发", 7600, 10110, 3000, 900, 180),
    f("coffeetable", "茶几", 7600, 8900, 1300, 650),
    f("armchair", "单人沙发", 9500, 8900, 850, 850, 90),
    f("shoecab", "鞋柜", 4995, 9900, 1000, 350, 270),
    f("plant", "绿植", 9950, 10250, 500, 500),
    f("plant", "绿植", 5250, 7050, 500, 500),
    f("bed", "双人床", 7323, 5500, 1500, 2000, 270, "#d8c7dc"),
    f("wardrobe", "衣柜", 8500, 3910, 2000, 600),
    f("desk", "书桌", 9500, 6070, 1200, 600, 180),
    f("chair", "椅子", 9500, 5480, 450, 480),
    f("baycushion", "飘窗垫", 10770, 4997, 520, 1575),
    f("roundtable", "茶桌", 11180, 8200, 600, 600),
    f("armchair", "休闲椅", 11180, 7520, 750, 750),
    f("armchair", "休闲椅", 11180, 8880, 750, 750, 180),
    f("plant", "绿植", 11550, 10250, 500, 500),
  ];
}
export function referenceDesign(): Design {
  const data: [string, string, Point[], string, boolean?][] = [
    ["master", "主卧室", rect(6600, 0, 3670, 3370), "wood"],
    ["mbath", "主卫浴", rect(4820, 0, 1540, 2080), "antislip"],
    ["kid", "小孩房", rect(1820, 0, 2760, 3370), "wood"],
    ["gbath", "客卫浴", rect(2420, 3610, 2160, 1340), "antislip"],
    ["laundry", "洗衣阳台", rect(0, 3610, 2180, 1340), "antislip"],
    ["child", "子女房", rect(6323, 3610, 3947, 2760), "wood"],
    ["kitchen", "厨房", rect(0, 5190, 2180, 2770), "tile600"],
    [
      "dining",
      "餐厅",
      [
        [2420, 5190],
        [4820, 5190],
        [4820, 7960],
        [2420, 7960],
        [2420, 7400],
        [2180, 7400],
        [2180, 5796],
        [2420, 5796],
      ],
      "tile800",
    ],
    [
      "hall",
      "过道",
      [
        [4820, 2320],
        [6360, 2320],
        [6360, 3370],
        [6083, 3370],
        [6083, 6610],
        [4820, 6610],
      ],
      "tile800",
    ],
    ["living", "客厅", rect(4820, 6610, 5450, 3950), "tile800"],
    ["balcony", "休闲阳台", rect(10510, 6610, 1340, 3950), "walnut"],
    [
      "bay1",
      "主卧飘窗",
      [
        [10270, 800],
        [10510, 800],
        [10510, 760],
        [11030, 760],
        [11030, 2650],
        [10510, 2650],
        [10510, 2600],
        [10270, 2600],
      ],
      "marble",
      false,
    ],
    [
      "bay2",
      "子女房飘窗",
      [
        [10270, 4260],
        [10510, 4260],
        [10510, 4210],
        [11030, 4210],
        [11030, 5785],
        [10510, 5785],
        [10510, 5740],
        [10270, 5740],
      ],
      "marble",
      false,
    ],
  ];
  const ws = walls.map((r, i) =>
    fromRect(
      r.slice(0, 4) as number[],
      "w" + i,
      r[4] === "b"
        ? "bearing"
        : r[4] === "e"
          ? "exterior"
          : r[4] === "low"
            ? "low"
            : "partition",
    ),
  );
  const openings = [
    ...windows.map((r, i) => ({ r, kind: "window" as const, id: "win" + i })),
    ...doors.map((r, i) => ({ r, kind: "door" as const, id: "door" + i })),
  ].map(({ r, kind, id }) => {
    const wall = fromRect(r, "opening-wall-" + id, "exterior");
    ws.push(wall);
    return {
      id,
      wallId: wall.id,
      kind,
      offset: lengthOf(wall) / 2,
      width: lengthOf(wall),
      open: true,
    };
  });
  return {
    version: 2,
    template: "reference",
    width: 11850,
    depth: 10560,
    thickness: 240,
    height: 2800,
    walls: ws,
    openings,
    rooms: data.map(([id, name, poly, mat, counted]) => ({
      id,
      name,
      rings: [poly],
      mat,
      counted,
    })),
    furniture: defaultFurniture(),
    demolished: [],
    measures: [],
  };
}
function lengthOf(w: Wall) {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}
export function blankDesign(): Design {
  return {
    version: 2,
    template: "blank",
    width: 6000,
    depth: 6000,
    thickness: 240,
    height: 2800,
    walls: outerWalls(6000, 6000, 240),
    openings: [],
    rooms: [
      {
        id: uid(),
        name: "房间 1",
        rings: [rect(0, 0, 6000, 6000)],
        mat: "wood",
      },
    ],
    furniture: [],
    demolished: [],
    measures: [],
  };
}
export function createProject(
  template: Design["template"] = "blank",
  name?: string,
): Project {
  return {
    id: uid(),
    name:
      name || (template === "blank" ? "未命名户型" : "三室两厅两卫 · 原木之家"),
    state: template === "blank" ? blankDesign() : referenceDesign(),
    updatedAt: new Date().toISOString(),
    revision: 0,
  };
}
