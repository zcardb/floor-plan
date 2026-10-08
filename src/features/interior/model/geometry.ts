import polygonClipping from "polygon-clipping";
import {
  uid,
  type Design,
  type Point,
  type Room,
  type Wall,
  type Furniture,
} from "./types";
export const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
export const ringArea = (p: Point[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0),
  ) / 2;
export const area = (r: Room) =>
  (ringArea(r.rings[0]) -
    r.rings.slice(1).reduce((s, p) => s + ringArea(p), 0)) /
  1e6;
export const perim = (r: Room) =>
  r.rings.reduce(
    (s, p) =>
      s +
      p.reduce(
        (n, a, i) =>
          n +
          Math.hypot(
            a[0] - p[(i + 1) % p.length][0],
            a[1] - p[(i + 1) % p.length][1],
          ),
        0,
      ),
    0,
  ) / 1000;
export function bbox(points: Point[]) {
  return {
    x: Math.min(...points.map((p) => p[0])),
    y: Math.min(...points.map((p) => p[1])),
    x2: Math.max(...points.map((p) => p[0])),
    y2: Math.max(...points.map((p) => p[1])),
  };
}
export function inRing(p: Point, ring: Point[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
export const inRoom = (p: Point, r: Room) =>
  inRing(p, r.rings[0]) && !r.rings.slice(1).some((h) => inRing(p, h));
export function center(r: Room): Point {
  const b = bbox(r.rings[0]),
    c: Point = [(b.x + b.x2) / 2, (b.y + b.y2) / 2];
  if (inRoom(c, r)) return c;
  for (let y = b.y + 100; y < b.y2; y += 200)
    for (let x = b.x + 100; x < b.x2; x += 200)
      if (inRoom([x, y], r)) return [x, y];
  return r.rings[0][0];
}
export const length = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
export function wallPoly(w: Wall, extend = 0): Point[] {
  const L = length(w),
    dx = (w.b[0] - w.a[0]) / L,
    dy = (w.b[1] - w.a[1]) / L,
    t = w.thickness / 2;
  return [
    [w.a[0] - dx * extend - dy * t, w.a[1] - dy * extend + dx * t],
    [w.b[0] + dx * extend - dy * t, w.b[1] + dy * extend + dx * t],
    [w.b[0] + dx * extend + dy * t, w.b[1] + dy * extend - dx * t],
    [w.a[0] - dx * extend + dy * t, w.a[1] - dy * extend - dx * t],
  ];
}
export function nearestOnWall(p: Point, w: Wall) {
  const L = length(w),
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) +
          (p[1] - w.a[1]) * (w.b[1] - w.a[1])) /
          (L * L),
      ),
    );
  return {
    point: [
      w.a[0] + (w.b[0] - w.a[0]) * t,
      w.a[1] + (w.b[1] - w.a[1]) * t,
    ] as Point,
    offset: t * L,
  };
}
export function outerWalls(width: number, depth: number, t: number): Wall[] {
  return [
    [
      [-t / 2, -t / 2],
      [width + t / 2, -t / 2],
    ],
    [
      [width + t / 2, -t / 2],
      [width + t / 2, depth + t / 2],
    ],
    [
      [width + t / 2, depth + t / 2],
      [-t / 2, depth + t / 2],
    ],
    [
      [-t / 2, depth + t / 2],
      [-t / 2, -t / 2],
    ],
  ].map(([a, b], i) => ({
    id: "outer-" + i,
    a: a as Point,
    b: b as Point,
    thickness: t,
    kind: "exterior",
  }));
}
export function rebuildRooms(d: Design): Design {
  if (d.template !== "blank") return d;
  const cuts = d.walls.filter(
    (w) => w.kind === "partition" && !d.demolished.includes(w.id),
  );
  const polygons = cuts.length
    ? polygonClipping.difference(
        [rect(0, 0, d.width, d.depth)],
        ...cuts.map((w) => [wallPoly(w, 1)]),
      )
    : [[rect(0, 0, d.width, d.depth)]];
  const used = new Set<string>();
  const rooms: Room[] = polygons
    .filter((poly) => ringArea(poly[0] as Point[]) > 10000)
    .map((poly, i) => {
      const rings = poly.map(
        (r) =>
          r.slice(
            0,
            r.length > 1 &&
              r[0][0] === r[r.length - 1][0] &&
              r[0][1] === r[r.length - 1][1]
              ? -1
              : undefined,
          ) as Point[],
      );
      const next: Room = {
        id: uid(),
        name: "房间 " + (i + 1),
        rings,
        mat: "wood",
      };
      const previous = d.rooms
        .map((r) => ({
          r,
          overlap: polygonClipping
            .intersection(r.rings, rings)
            .reduce(
              (s, p) =>
                s +
                ringArea(p[0] as Point[]) -
                p.slice(1).reduce((n, h) => n + ringArea(h as Point[]), 0),
              0,
            ),
        }))
        .sort((a, b) => b.overlap - a.overlap)
        .find((v) => v.overlap > 0 && !used.has(v.r.id));
      if (previous) {
        used.add(previous.r.id);
        next.id = previous.r.id;
        next.name = previous.r.name;
        next.mat = previous.r.mat;
        next.wallMat = previous.r.wallMat;
      }
      return next;
    });
  return { ...d, rooms };
}
export function resizeBlank(
  d: Design,
  width: number,
  depth: number,
  thickness: number,
): Design {
  return rebuildRooms({
    ...d,
    width,
    depth,
    thickness,
    walls: [
      ...outerWalls(width, depth, thickness),
      ...d.walls.filter((w) => w.kind !== "exterior"),
    ],
  });
}
export const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
export function aabb(f: Furniture) {
  const a = (f.rot * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return {
    hw: (f.w / 2) * c + (f.d / 2) * s,
    hh: (f.w / 2) * s + (f.d / 2) * c,
  };
}
export function snapMove(
  f: Furniture,
  p: Point,
  d: Design,
  snap: boolean,
  tol = 150,
): Point {
  let x = Math.round(p[0] / 10) * 10,
    y = Math.round(p[1] / 10) * 10;
  if (!snap) return [x, y];
  const { hw, hh } = aabb(f);
  let bx = tol,
    by = tol;
  for (const wall of d.walls.filter((w) => !d.demolished.includes(w.id))) {
    const b = bbox(wallPoly(wall));
    if (b.y2 >= p[1] - hh - tol && b.y <= p[1] + hh + tol)
      for (const edge of [b.x, b.x2])
        for (const v of [edge - hw, edge + hw])
          if (Math.abs(v - p[0]) < bx) {
            bx = Math.abs(v - p[0]);
            x = v;
          }
    if (b.x2 >= p[0] - hw - tol && b.x <= p[0] + hw + tol)
      for (const edge of [b.y, b.y2])
        for (const v of [edge - hh, edge + hh])
          if (Math.abs(v - p[1]) < by) {
            by = Math.abs(v - p[1]);
            y = v;
          }
  }
  return [x, y];
}
export function pushOut(f: Furniture, d: Design) {
  for (let i = 0; i < 4; i++) {
    let moved = false;
    for (const wall of d.walls.filter((w) => !d.demolished.includes(w.id))) {
      const b = bbox(wallPoly(wall)),
        { hw, hh } = aabb(f),
        ox = Math.min(f.cx + hw, b.x2) - Math.max(f.cx - hw, b.x),
        oy = Math.min(f.cy + hh, b.y2) - Math.max(f.cy - hh, b.y);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) f.cx = f.cx < (b.x + b.x2) / 2 ? b.x - hw : b.x2 + hw;
      else f.cy = f.cy < (b.y + b.y2) / 2 ? b.y - hh : b.y2 + hh;
      moved = true;
    }
    if (!moved) break;
  }
  return f;
}
export function snapPoint(p: Point, d: Design, tol = 120): Point {
  let out: Point = [Math.round(p[0] / 10) * 10, Math.round(p[1] / 10) * 10];
  let dist = tol;
  for (const w of d.walls) {
    for (const q of [w.a, w.b, nearestOnWall(p, w).point]) {
      const n = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (n < dist) {
        dist = n;
        out = q;
      }
    }
  }
  return out;
}
export const roomPath = (r: Room) =>
  r.rings.map((p) => "M" + p.map((q) => q.join(",")).join("L") + "Z").join("");
