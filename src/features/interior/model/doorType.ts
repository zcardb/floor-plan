import { doorOrientation } from './doorOrientation';
import type { Design, Opening, Point } from './types';

/** 门的开启方式：单开 / 双开 / 推拉。缺省视为单开，老数据与导入的图纸都按单开渲染。 */
export type DoorType = 'single' | 'double' | 'sliding';
export const DOOR_TYPES: readonly DoorType[] = ['single', 'double', 'sliding'];

export const DOOR_TYPE_LABEL: Record<DoorType, string> = { single: '单开门', double: '双开门', sliding: '推拉门' };

/** 推拉门扇厚度（mm）：两扇沿墙中线一前一后叠放。 */
export const SLIDING_PANEL_DEPTH = 60;

/** 只作用于门：切换开启方式，位置与宽度都不变。 */
export function changeDoorType(d: Design, id: string, type: DoorType): Design {
  return { ...d, openings: d.openings.map(o => (o.id === id && o.kind === 'door' ? { ...o, doorType: type } : o)) };
}

/** 门扇：从 `from` 到 `to` 的一条线段（局部坐标，门洞中心为原点，x 沿墙）。 */
export interface DoorLeaf { from: Point; to: Point }
/** 开启弧线（虚线）：单开 / 双开各一段，圆心在铰链侧、半径等于门扇宽。 */
export interface DoorArc { center: Point; radius: number; from: Point; to: Point }
/** 推拉门扇：矩形（局部坐标的左上角 x / y 与宽、厚）。 */
export interface DoorPanel { x: number; y: number; width: number; depth: number }

/**
 * 门符号（局部坐标，符合建筑制图 / CAD 惯例）：
 * - 单开：一扇门扇 + 90° 开启弧，铰链侧沿门洞左或右；
 * - 双开：两扇各半个洞口宽，分别铰接在两侧，弧线在洞口中间相接；
 * - 推拉：两扇沿墙错位叠放，不画开启弧（门扇平移，没有回转范围）。
 * 开启侧（`swingSide`）决定这些几何画在墙的哪一侧。
 */
export function doorSymbol(door: Opening): { leaves: DoorLeaf[]; arcs: DoorArc[]; panels: DoorPanel[] } {
  const { mirrorX, mirrorY } = doorOrientation(door);
  const half = door.width / 2;
  /** 铰接在 `hinge`、宽 `size` 的门扇：开启位置垂直于墙，开启弧扫到关闭位置（沿墙指向 `toward`）。 */
  const swing = (hinge: Point, size: number, toward: 1 | -1) => {
    const open: Point = [hinge[0], -size * mirrorY], closed: Point = [hinge[0] + toward * size, 0];
    return { leaf: { from: hinge, to: open }, arc: { center: hinge, radius: size, from: open, to: closed } };
  };
  switch (doorType(door)) {
    case 'double': {
      const left = swing([-half, 0], half, 1), right = swing([half, 0], half, -1);
      return { leaves: [left.leaf, right.leaf], arcs: [left.arc, right.arc], panels: [] };
    }
    case 'sliding': {
      // 两扇各约 2/3 洞口宽，中间搭接 1/3，一扇在墙中线一侧、另一扇在另一侧。
      const width = (door.width * 2) / 3, depth = SLIDING_PANEL_DEPTH;
      const front = mirrorY > 0 ? -depth : 0, back = mirrorY > 0 ? 0 : -depth;
      return { leaves: [], arcs: [], panels: [{ x: -half, y: front, width, depth }, { x: half - width, y: back, width, depth }] };
    }
    default: {
      const single = swing([-half * mirrorX, 0], door.width, mirrorX as 1 | -1);
      return { leaves: [single.leaf], arcs: [single.arc], panels: [] };
    }
  }
}

export const doorType = (door: Opening): DoorType => door.doorType ?? 'single';

/** 弧线从 `from` 到 `to` 是否顺时针（y 轴向下的图纸坐标）；SVG 的 sweep-flag 与 DXF 圆弧方向都由它决定。 */
export const arcClockwise = (center: Point, from: Point, to: Point) =>
  (from[0] - center[0]) * (to[1] - center[1]) - (from[1] - center[1]) * (to[0] - center[0]) > 0;

/** 每扇门的开启扫掠区（局部坐标多边形：铰链 + 开启弧）；推拉门没有扫掠区。 */
export function doorSweeps(door: Opening): Point[][] {
  return doorSymbol(door).arcs.map(({ center, radius, from, to }) => {
    const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]), a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
    // 开启弧恒为 90°：取 from → to 的最短转角。
    const turn = ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return [center, ...Array.from({ length: 13 }, (_, i) => {
      const angle = a0 + (turn * i) / 12;
      return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)] as Point;
    })];
  });
}

/** 门符号占到的范围（局部坐标点集）：开启弧上的点，推拉门则是两扇门扇的角点。用于选中框与定位。 */
export function doorSwingPoints(door: Opening): Point[] {
  const panels = doorSymbol(door).panels.flatMap(p => [[p.x, p.y], [p.x + p.width, p.y + p.depth]] as Point[]);
  return [...doorSweeps(door).flatMap(sweep => sweep.slice(1)), ...panels];
}
