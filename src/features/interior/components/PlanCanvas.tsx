import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessage, notify } from "@/lib/notify";
import { canResizeWall, isBearingWall, isOnBearingWall, BEARING_WALL_WARNING } from '../model/wallPolicy';
import { syncRooms } from '../model/roomFollow';
import {
  area,
  center,
  length,
  nearestOnWall,
  norm,
  roomPath,
} from "../model/geometry";
import { snapFurniture, sameGuides, type AlignmentGuide } from '../model/furnitureAlignment';
import { AlignmentGuides } from './AlignmentGuides';
import {
  uid,
  type Design,
  type Layers,
  type LibraryItem,
  type Point,
  type Selection,
  type Tool,
} from "../model/types";
import { FurnitureShape } from "./FurnitureShape";
import { MaterialDefs } from "./Materials";
import { selectionPoints, localWallPoint, type ScreenRect } from "../model/selectionAnchor";
import { resolveWallPoint,validateWallSegment } from '../model/wallDrawing';
import { useWallDrawing } from './useWallDrawing';
import { OpeningDistances } from './OpeningDistances';
import { connectedWallPoly } from '../model/wallConnections';
import { WallHoverOverlay } from './WallHoverOverlay';
import { formatMeters } from '../model/lengthUnits';
import { perimeterDimensions, planDrawingBounds, type DimensionSegment } from '../model/perimeterDimensions';
import type { DimensionBinding } from '../model/dimensionBinding';
import { PerimeterDimensions } from './PerimeterDimensions';
import { doorOrientation } from '../model/doorOrientation';
import { dragOpening } from '../model/openingDrag';
import { isCompletionClick, supportsPointerCompletion } from '../model/toolCompletion';
export interface CanvasHandle {
  zoom: (k: number) => void;
  fit: () => void;
  ratio: (r: number) => void;
  exportImage: () => void;
}
interface Props {
  readOnly?: boolean;
  design: Design;
  selection: Selection;
  select: (s: Selection) => void;
  tool: Tool;
  layers: Layers;
  preview: (d: Design) => void;
  commit: (d: Design, before?: Design) => void;
  add: (it: LibraryItem, p: Point) => void;
  closePanels: () => void;
  onScale: (s: number) => void;
  onCoord: (p: Point) => void;
  onAnchor: (r: ScreenRect | null) => void;
  finishTool: () => void;
  onDimensionSelect?: (segment: DimensionSegment) => void;
  selectedDimension?: DimensionBinding;
}
interface Drag {
  pid: number;
  kind: string;
  start: Point;
  screen: Point;
  before: Design;
  id?: string;
  room?: string;
  offset?: Point;
  view?: { x: number; y: number; s: number };
  moved: boolean;
}
export const PlanCanvas = forwardRef<CanvasHandle, Props>(function PlanCanvas(
  {
    design,
    readOnly = false,
    selection,
    select,
    tool,
    layers,
    preview,
    commit,
    add,
    closePanels,
    onScale,
    onCoord,
    onAnchor,
    finishTool,
    onDimensionSelect,
    selectedDimension,
  },
  ref,
) {
  const svg = useRef<SVGSVGElement>(null),
    current = useRef(design);
  current.current = design;
  const dimensionLayout = useMemo(() => perimeterDimensions({ walls: design.walls, demolished: design.demolished, dimensionSettings: design.dimensionSettings }), [design.walls, design.demolished, design.dimensionSettings]);
  const [view, setView] = useState({ x: -2000, y: -2000, s: 0.05 }),
    vr = useRef(view);
  vr.current = view;
  const [size, setSize] = useState({ w: 800, h: 700 }),
    drag = useRef<Drag | null>(null),
    points = useRef(new Map<number, Point>()),
    pinch = useRef<{
      distance: number;
      view: typeof view;
      center: Point;
    } | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]),
    showGuides = (next: AlignmentGuide[]) => setGuides(prev => sameGuides(prev, next) ? prev : next);
  const mouseDown = useRef<(() => void) | null>(null);
  const wallClick = useRef<{id:string;fraction:number}|null>(null);
  const wallDrawing = useWallDrawing(tool === 'wall', current, view.s, layers.snap, commit, finishTool);
  const wallPolygons = useMemo(() => {
    const walls = wallDrawing.draft && length(wallDrawing.draft as Design['walls'][number]) >= 100
      ? [...design.walls, { id: 'draft', ...wallDrawing.draft, thickness: design.thickness, kind: 'partition' as const }]
      : design.walls;
    return new Map(design.walls.map(w => [w.id, connectedWallPoly(w, walls, design.demolished)]));
  }, [design.walls, design.demolished, design.thickness, wallDrawing.draft]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const matrix = el.getScreenCTM(),
      bounds = el.closest('.stage')!.getBoundingClientRect(),
      pts = selectionPoints(design, selection);
    if (
      !matrix ||
      !pts.length ||
      (selection?.kind === "furniture" && !layers.furn)
    ) {
      onAnchor(null);
      return;
    }
    const projected = pts.map(([x, y]) => {
      const p = el.createSVGPoint();
      p.x = x;
      p.y = y;
      const q = p.matrixTransform(matrix);
      return [q.x - bounds.left, q.y - bounds.top];
    });
    let local:ScreenRect['local'];
    if(selection?.kind==='wall'){
      const wall=design.walls.find(w=>w.id===selection.id)!;
      const point=localWallPoint(design,wall.id,wallClick.current?.id===wall.id?wallClick.current.fraction:0.5)!;
      const q=el.createSVGPoint();q.x=point[0];q.y=point[1];const p=q.matrixTransform(matrix);
      local={x:Math.max(0,Math.min(el.clientWidth,p.x-bounds.left)),y:Math.max(0,Math.min(el.clientHeight,p.y-bounds.top))};
    }
    onAnchor({
      local,
      left: Math.min(...projected.map((p) => p[0])),
      top: Math.min(...projected.map((p) => p[1])),
      right: Math.max(...projected.map((p) => p[0])),
      bottom: Math.max(...projected.map((p) => p[1])),
    });
  }, [design, selection, view, size, onAnchor, layers.furn]);
  const fit = () => {
    const el = svg.current;
    if (!el) return;
    const d = current.current,
      bb = planDrawingBounds(d, layers.dims);
    const margin = 1400,
      w = bb.x2 - bb.x + margin * 2,
      h = bb.y2 - bb.y + margin * 2,
      s = Math.min(el.clientWidth / w, el.clientHeight / h);
    setView({
      x: bb.x - margin - (el.clientWidth / s - w) / 2,
      y: bb.y - margin - (el.clientHeight / s - h) / 2,
      s,
    });
  };
  const zoom = (k: number, p?: Point) => {
    const v = vr.current,
      el = svg.current;
    if (!el) return;
    const [mx, my] = p || [el.clientWidth / 2, el.clientHeight / 2],
      s = Math.max(0.012, Math.min(1, v.s * k));
    setView({ s, x: v.x + mx / v.s - mx / s, y: v.y + my / v.s - my / s });
  };
  const mm = (e: { clientX: number; clientY: number }): Point => {
    const el = svg.current!,
      p = el.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  useEffect(() => {
    const el = svg.current!;
    let oldW = 0,
      oldH = 0;
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      setSize({ w, h });
      if (!oldW) fit();
      else
        setView((v) => ({
          ...v,
          x: v.x - (w - oldW) / 2 / v.s,
          y: v.y - (h - oldH) / 2 / v.s,
        }));
      oldW = w;
      oldH = h;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => onScale(view.s), [view.s, onScale]);
  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), [
        e.clientX - r.left,
        e.clientY - r.top,
      ]);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useImperativeHandle(ref, () => ({
    zoom,
    fit,
    ratio: (r) => zoom(96 / 25.4 / r / vr.current.s),
    exportImage: () => {
      const clone = svg.current!.cloneNode(true) as SVGSVGElement,
        d = current.current,
        b = planDrawingBounds(d, layers.dims),
        m = 1200,
        w = b.x2 - b.x + m * 2,
        h = b.y2 - b.y + m * 2;
      clone.setAttribute("viewBox", `${b.x - m} ${b.y - m} ${w} ${h}`);
      clone.setAttribute("width", "3200");
      clone.setAttribute("height", String(Math.round((3200 * h) / w)));
      clone.querySelectorAll("[data-export-hide]").forEach((e) => e.remove());
      clone.querySelectorAll('.dimension-selected').forEach(e => e.classList.remove('dimension-selected'));
      const vars = getComputedStyle(document.documentElement);
      let text = new XMLSerializer().serializeToString(clone);
      text = text.replace(/var\((--[\w-]+)\)/g, (_, key) =>
        vars.getPropertyValue(key).trim(),
      );
      text = text.replace(
        "</svg>",
        "<style>text{font-family:Arial,sans-serif}.furniture-drawing{stroke:#514a40;stroke-width:1;vector-effect:non-scaling-stroke}.furniture-drawing>*{vector-effect:non-scaling-stroke}.plan-room-name{fill:#2b2824;stroke:#fffdf9;stroke-width:40;paint-order:stroke;font-weight:600}.plan-room-area{fill:#665d50;stroke:#fffdf9;stroke-width:35;paint-order:stroke}.dimension{fill:none;stroke:#887b69;stroke-width:1;vector-effect:non-scaling-stroke}.dimension-text{fill:#887b69;stroke:none}.furn-label{fill:#514a40;stroke:#fffdf9;stroke-width:20;paint-order:stroke}</style></svg>",
      );
      const url = URL.createObjectURL(
          new Blob([text], { type: "image/svg+xml" }),
        ),
        img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 3200;
        c.height = Math.round((3200 * h) / w);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => {
          if (blob) {
            const a = document.createElement("a"),
              u = URL.createObjectURL(blob);
            a.href = u;
            a.download = "户型方案-2D.png";
            a.click();
            setTimeout(() => URL.revokeObjectURL(u), 1000);
            notify.success("2D 图片已下载");
          } else notify.error("2D 图片导出失败", "浏览器未能生成图片，请重试");
          URL.revokeObjectURL(url);
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        notify.error("2D 图片导出失败", "图纸渲染失败，请重试");
      };
      img.src = url;
    },
  }));
  const finish = (cancel = false) => {
    const dr = drag.current;
    drag.current = null;
    showGuides([]);
    if (!dr) return;
    if (cancel) {
      preview(dr.before);
      return;
    }
    const d = current.current;
    if (dr.kind === 'openingmove') {
      const original = dr.before.openings.find(o => o.id === dr.id);
      const moved = d.openings.find(o => o.id === dr.id);
      if (dr.moved && original && moved && original.offset !== moved.offset) {
        commit(d, dr.before);
        if (isOnBearingWall(d, moved.wallId)) notify.warning(BEARING_WALL_WARNING);
      }
      return;
    }
    if (["move", "rot", "size", "wallmove", "endpoint"].includes(dr.kind)) {
      if (dr.moved) {
        const wallEdit = dr.kind === "wallmove" || dr.kind === "endpoint";
        let next = d;
        if (wallEdit) {
          try {
            next = syncRooms(dr.before, d);
          } catch (cause) {
            preview(dr.before);
            notify.fail(errorMessage(cause, "该调整会破坏房间划分"));
            return;
          }
        }
        commit(next, dr.before);
        if (next.rooms.length !== dr.before.rooms.length)
          notify.info("房间划分已更新，请检查名称与地面材质");
        const wall = wallEdit ? next.walls.find((w) => w.id === dr.id) : undefined;
        const opening = next.openings.find((o) => o.id === dr.id);
        if ((wall && isBearingWall(wall) && next.template !== "blank") || (opening && isOnBearingWall(next, opening.wallId)))
          notify.warning(BEARING_WALL_WARNING);
      }
      return;
    }
    if (dr.kind === "pan") {
      if (!dr.moved) select(dr.room ? { kind: "room", id: dr.room } : null);
      return;
    }
  };
  const completeTool = () => {
    if (!supportsPointerCompletion(tool)) return;
    wallDrawing.clear();
    drag.current = null;
    showGuides([]);
    mouseDown.current = null;
    pinch.current = null;
    for (const id of points.current.keys()) {
      if (svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
    }
    points.current.clear();
    finishTool();
  };
  useEffect(() => { mouseDown.current = null; }, [tool]);
  return (
    <svg
      ref={svg}
      className={"plan-canvas tool-" + tool}
      viewBox={`${view.x} ${view.y} ${size.w / view.s} ${size.h / view.s}`}
      role="application"
      aria-label="户型平面编辑画布"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (readOnly) return;
        try {
          add(
            JSON.parse(e.dataTransfer.getData("application/interior-item")),
            mm(e),
          );
        } catch {
          notify.fail("无法放置此构件");
        }
      }}
      onPointerDown={(e) => {
        if (e.button) return;
        const begin = () => {
        closePanels();
        const p = mm(e),
          el = e.target as SVGElement;
        points.current.set(e.pointerId, [e.clientX, e.clientY]);
        svg.current!.setPointerCapture(e.pointerId);
        if (points.current.size === 2) {
          finish(true);
          wallDrawing.clear();
          const [a, b] = [...points.current.values()];
          pinch.current = {
            distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
            view: vr.current,
            center: mm({
              clientX: (a[0] + b[0]) / 2,
              clientY: (a[1] + b[1]) / 2,
            }),
          };
          return;
        }
        const base: Drag = {
          pid: e.pointerId,
          kind: "pan",
          start: p,
          screen: [e.clientX, e.clientY],
          before: structuredClone(current.current),
          moved: false,
          view: vr.current,
        };
        const wallEl = el.closest("[data-wall]"),
          fid = el.closest("[data-fid]")?.getAttribute("data-fid"),
          wid = wallEl?.getAttribute("data-wall"),
          oid = el.closest("[data-opening]")?.getAttribute("data-opening"),
          handle = el.closest("[data-handle]")?.getAttribute("data-handle");
        if (readOnly) {
          if (fid) select({ kind: 'furniture', id: fid });
          else if (oid) select({ kind: 'opening', id: oid });
          else if (wid) select({ kind: 'wall', id: wid });
          else base.room = el.closest('[data-room]')?.getAttribute('data-room') || undefined;
          drag.current = base;
          return;
        }
        if (tool === 'wall') {
          if (design.template !== 'blank') return;
          select(null); wallDrawing.down(p, e.pointerId, [e.clientX, e.clientY]); return;
        }
        if ((tool === "door" || tool === "window") && wid) {
          const wall = design.walls.find((w) => w.id === wid)!;
          if (isBearingWall(wall)) {
            notify.fail("承重墙不可新增开口");
            return;
          }
          const width = tool === "door" ? 900 : 1200,
            L = length(wall);
          if (width > L) {
            notify.fail("此墙段长度不足");
            return;
          }
          const offset = Math.min(
            L - width / 2,
            Math.max(width / 2, nearestOnWall(p, wall).offset),
          );
          if (
            design.openings.some(
              (o) =>
                o.wallId === wid &&
                Math.abs(o.offset - offset) < (o.width + width) / 2,
            )
          ) {
            notify.fail("门窗不能重叠");
            return;
          }
          const o = {
            id: uid(),
            wallId: wid,
            kind: tool,
            offset,
            width,
            open: true,
          };
          commit({ ...design, openings: [...design.openings, o] });
          select({ kind: "opening", id: o.id });
          finishTool();
          return;
        } else if (handle && selection) {
          const selectedWall = selection.kind === 'wall' ? design.walls.find(w => w.id === selection.id) : null;
          if (selectedWall && !canResizeWall(design, selectedWall)) return;
          base.kind = handle === "a" || handle === "b" ? "endpoint" : handle;
          base.id = selection.id;
          base.room = handle;
        } else if (fid) {
          const f = design.furniture.find((f) => f.id === fid)!;
          select({ kind: "furniture", id: fid });
          base.kind = "move";
          base.id = fid;
          base.offset = [p[0] - f.cx, p[1] - f.cy];
        } else if (oid) {
          select({ kind: "opening", id: oid });
          if (tool === 'door' || tool === 'window') finishTool();
          base.kind = 'openingmove';
          base.id = oid;
        } else if (wid && tool === "select") {
          const w = design.walls.find((w) => w.id === wid)!;
          wallClick.current={id:wid,fraction:nearestOnWall(p,w).offset/length(w)};
          select({ kind: "wall", id: wid });
          if (canResizeWall(design, w)) {
            base.kind = "wallmove";
            base.id = wid;
          } else return;
        } else
          base.room =
            el.closest("[data-room]")?.getAttribute("data-room") || undefined;
        drag.current = base;
        };
        // MouseEvent.detail contains the native double-click count; PointerEvent.detail does not.
        if (e.pointerType === 'mouse' && supportsPointerCompletion(tool)) mouseDown.current = begin;
        else begin();
      }}
      onMouseDown={(e) => {
        const begin = mouseDown.current;
        mouseDown.current = null;
        if (isCompletionClick(tool, e.button, e.detail)) {
          e.preventDefault();
          completeTool();
        } else if (e.button === 0) begin?.();
      }}
      onDoubleClick={(e) => {
        if (!supportsPointerCompletion(tool)) return;
        e.preventDefault();
        completeTool();
      }}
      onContextMenu={(e) => {
        if (!supportsPointerCompletion(tool)) return;
        e.preventDefault();
        completeTool();
      }}
      onPointerMove={(e) => {
        if (points.current.has(e.pointerId))
          points.current.set(e.pointerId, [e.clientX, e.clientY]);
        if (pinch.current && points.current.size >= 2) {
          const [a, b] = [...points.current.values()],
            pin = pinch.current,
            r = svg.current!.getBoundingClientRect(),
            mx = (a[0] + b[0]) / 2 - r.left,
            my = (a[1] + b[1]) / 2 - r.top,
            s = Math.max(
              0.012,
              Math.min(
                1,
                (pin.view.s * Math.hypot(a[0] - b[0], a[1] - b[1])) /
                  pin.distance,
              ),
            );
          setView({ s, x: pin.center[0] - mx / s, y: pin.center[1] - my / s });
          return;
        }
        const p = mm(e);
        onCoord(p);
        if (tool === 'wall') { wallDrawing.move(p); return; }
        const dr = drag.current;
        if (!dr) return;
        if (dr.pid !== e.pointerId) return;
        if (Math.hypot(e.clientX - dr.screen[0], e.clientY - dr.screen[1]) > 5)
          dr.moved = true;
        if (!dr.moved) return;
        if (dr.kind === "pan") {
          setView({
            ...dr.view!,
            x: dr.view!.x - (e.clientX - dr.screen[0]) / dr.view!.s,
            y: dr.view!.y - (e.clientY - dr.screen[1]) / dr.view!.s,
          });
          return;
        }
        if (dr.kind === 'openingmove') {
          const next = dragOpening(dr.before, dr.id!, dr.start, p);
          if (next && next.openings.find(o => o.id === dr.id)?.offset !== current.current.openings.find(o => o.id === dr.id)?.offset) preview(next);
          return;
        }
        const next = structuredClone(dr.before),
          f = next.furniture.find((f) => f.id === dr.id),
          wall = next.walls.find((w) => w.id === dr.id);
        if (f) {
          if (dr.kind === "move") {
            const snapped = snapFurniture(f, [p[0] - dr.offset![0], p[1] - dr.offset![1]], next, layers.snap, 8 / view.s);
            [f.cx, f.cy] = snapped.point;
            showGuides(snapped.guides);
          }
          if (dr.kind === "rot") {
            const a =
              (Math.atan2(p[1] - f.cy, p[0] - f.cx) * 180) / Math.PI + 90;
            f.rot = norm(e.shiftKey ? a : Math.round(a / 15) * 15);
          }
          if (dr.kind === "size") {
            const a = (f.rot * Math.PI) / 180,
              dx = p[0] - f.cx,
              dy = p[1] - f.cy;
            f.w = Math.max(
              100,
              Math.round(((dx * Math.cos(a) + dy * Math.sin(a)) * 2) / 10) * 10,
            );
            f.d = Math.max(
              100,
              Math.round(((-dx * Math.sin(a) + dy * Math.cos(a)) * 2) / 10) *
                10,
            );
          }
        }
        if (wall) {
          if (dr.kind === "wallmove") {
            const dx = Math.round((p[0] - dr.start[0]) / 10) * 10,
              dy = Math.round((p[1] - dr.start[1]) / 10) * 10;
            wall.a = [wall.a[0] + dx, wall.a[1] + dy];
            wall.b = [wall.b[0] + dx, wall.b[1] + dy];
          } else if (dr.kind === "endpoint") {
            const key = dr.room as "a" | "b",
              other = key === "a" ? wall.b : wall.a,
              q = resolveWallPoint(p,next,view.s,layers.snap,other,wall.id).point;
            wall[key] = q;
            try { validateWallSegment(next,wall.a,wall.b,wall.id); } catch { return; }
            if (length(wall) < 100) return;
            if (
              next.openings.some(
                (o) =>
                  o.wallId === wall.id && o.offset + o.width / 2 > length(wall),
              )
            )
              return;
          }
        }
        preview(next);
      }}
      onPointerUp={(e) => {
        points.current.delete(e.pointerId);
        if (pinch.current) {
          if (points.current.size < 2) pinch.current = null;
          return;
        }
        if (tool === 'wall') wallDrawing.up(mm(e), e.pointerId, [e.clientX, e.clientY]);
        else finish();
      }}
      onPointerLeave={() => wallDrawing.clearHover()}
      onPointerCancel={(e) => {
        points.current.delete(e.pointerId);
        pinch.current = null;
        wallDrawing.clear();
        finish(true);
      }}
    >
      <MaterialDefs design={design} />
      <rect
        x={-100000}
        y={-100000}
        width={200000}
        height={200000}
        fill={layers.grid ? "url(#plan-grid)" : "var(--plan-paper)"}
      />
      {design.rooms.map((r) => (
        <path
          key={r.id}
          data-room={r.id}
          d={roomPath(r)}
          fill={"url(#mat-" + r.mat + ")"}
          fillRule="evenodd"
          className="plan-room"
        />
      ))}
      {layers.furn &&
        design.furniture.map((f) => (
          <g
            key={f.id}
            data-fid={f.id}
            transform={`translate(${f.cx} ${f.cy}) rotate(${f.rot})`}
            className="plan-furn"
          >
            <FurnitureShape f={f} />
            {Math.min(f.w, f.d) > 380 &&
              ![
                "plant",
                "chair",
                "rug",
                "floorlamp",
                "sidetable",
                "barstool",
                "baycushion",
              ].includes(f.type) && (
                <text
                  className="furn-label"
                  transform={`rotate(${-f.rot})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.min(155, Math.min(f.w, f.d) * 0.19)}
                  pointerEvents="none"
                >
                  {f.name}
                </text>
              )}
          </g>
        ))}
      {design.walls.map((w) => (
        <polygon
          key={w.id}
          data-wall={w.id}
          points={wallPolygons.get(w.id)!
            .map((p) => p.join(","))
            .join(" ")}
          fill={
            design.demolished.includes(w.id)
              ? "var(--plan-demolished)"
              : isBearingWall(w)
                ? layers.bearing
                  ? "var(--plan-bearing)"
                  : w.color || "var(--plan-ink)"
                : w.color ||
                  (w.kind === "exterior"
                    ? "var(--plan-exterior)"
                    : "var(--plan-wall)")
          }
          stroke={
            design.demolished.includes(w.id) ? "var(--plan-selection)" : "none"
          }
          strokeDasharray="80 50"
          className="plan-wall"
        />
      ))}
      {design.openings.map((o) => {
        const w = design.walls.find((w) => w.id === o.wallId);
        if (!w) return null;
        const L = length(w),
          x = w.a[0] + ((w.b[0] - w.a[0]) * o.offset) / L,
          y = w.a[1] + ((w.b[1] - w.a[1]) * o.offset) / L,
          angle =
            (Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 180) / Math.PI;
        return (
          <g
            key={o.id}
            data-opening={o.id}
            transform={`translate(${x} ${y}) rotate(${angle})`}
            className="plan-opening"
          >
            <rect
              x={-o.width / 2}
              y={-w.thickness / 2}
              width={o.width}
              height={w.thickness}
              fill="var(--plan-porcelain)"
            />
            {o.kind === "window" ? (
              <>
                <rect
                  x={-o.width / 2}
                  y={-w.thickness / 2}
                  width={o.width}
                  height={w.thickness}
                  fill="var(--plan-glass)"
                  stroke="var(--plan-window)"
                  strokeWidth={18}
                />
                <path
                  d={`M${-o.width / 2} 0H${o.width / 2}`}
                  stroke="var(--plan-window)"
                  strokeWidth={15}
                />
              </>
            ) : (
              <g transform={`scale(${doorOrientation(o).mirrorX} ${doorOrientation(o).mirrorY})`}>
                <path
                  d={`M${-o.width / 2} 0V${-o.width}`}
                  stroke="var(--plan-wood-dark)"
                  strokeWidth={35}
                />
                <path
                  d={`M${-o.width / 2} ${-o.width}A${o.width} ${o.width} 0 0 1 ${o.width / 2} 0`}
                  fill="none"
                  stroke="var(--plan-ink)"
                  strokeWidth={10}
                  strokeDasharray="50 40"
                />
              </g>
            )}
          </g>
        );
      })}
      {layers.labels &&
        design.rooms
          .filter((r) => r.counted !== false)
          .map((r) => {
            const p = center(r);
            return (
              <g key={r.id} pointerEvents="none">
                <text
                  x={p[0]}
                  y={p[1]}
                  textAnchor="middle"
                  fontSize={220}
                  className="plan-room-name"
                >
                  {r.name}
                </text>
                <text
                  x={p[0]}
                  y={p[1] + 250}
                  textAnchor="middle"
                  fontSize={160}
                  className="plan-room-area"
                >
                  {area(r).toFixed(2)} m²
                </text>
              </g>
            );
          })}
      {layers.dims && <PerimeterDimensions layout={dimensionLayout} onSelect={tool === 'select' ? onDimensionSelect : undefined} selected={selectedDimension} />}
      {tool==='wall' && wallDrawing.draft && Math.hypot(wallDrawing.draft.b[0]-wallDrawing.draft.a[0],wallDrawing.draft.b[1]-wallDrawing.draft.a[1])>0 && <g data-export-hide="true" pointerEvents="none"><polygon points={connectedWallPoly({id:'draft',...wallDrawing.draft,thickness:design.thickness,kind:'partition'},design.walls,design.demolished).map(p=>p.join(',')).join(' ')} fill="var(--plan-selection-soft)" stroke="var(--plan-selection)" strokeWidth={1/view.s}/><MeasureLine a={wallDrawing.draft.a} b={wallDrawing.draft.b} scale={view.s}/></g>}
      {tool === 'wall' && <WallHoverOverlay walls={design.walls} demolished={design.demolished} candidate={wallDrawing.hover} connection={wallDrawing.candidate} scale={view.s} />}
      <AlignmentGuides guides={guides} scale={view.s} />
      {selection?.kind === 'opening' && <OpeningDistances design={design} openingId={selection.id} scale={view.s} />}
      {selection && (
        <g data-export-hide="true" className="selection-overlay">
          {selection.kind === "room" &&
            design.rooms
              .filter((r) => r.id === selection.id)
              .map((r) => (
                <path
                  key={r.id}
                  d={roomPath(r)}
                  fill="var(--plan-selection-soft)"
                  fillRule="evenodd"
                  stroke="var(--plan-selection)"
                  strokeWidth={2 / view.s}
                  pointerEvents="none"
                />
              ))}
          {selection.kind === "furniture" &&
            design.furniture
              .filter((f) => f.id === selection.id)
              .map((f) => (
                <g
                  key={f.id}
                  transform={`translate(${f.cx} ${f.cy}) rotate(${f.rot})`}
                >
                  <rect
                    x={-f.w / 2 - 5 / view.s}
                    y={-f.d / 2 - 5 / view.s}
                    width={f.w + 10 / view.s}
                    height={f.d + 10 / view.s}
                    fill="none"
                    stroke="var(--plan-selection)"
                    strokeWidth={1.5 / view.s}
                    strokeDasharray={`${5 / view.s} ${3 / view.s}`}
                    pointerEvents="none"
                  />
                  <line
                    x1={0}
                    y1={-f.d / 2}
                    x2={0}
                    y2={-f.d / 2 - 30 / view.s}
                    stroke="var(--plan-selection)"
                    strokeWidth={1 / view.s}
                  />
                  <circle
                    data-handle="rot"
                    cx={0}
                    cy={-f.d / 2 - 30 / view.s}
                    r={10 / view.s}
                    fill="var(--plan-porcelain)"
                    stroke="var(--plan-selection)"
                    strokeWidth={2 / view.s}
                  />
                  <rect
                    data-handle="size"
                    x={f.w / 2 - 7 / view.s}
                    y={f.d / 2 - 7 / view.s}
                    width={14 / view.s}
                    height={14 / view.s}
                    fill="var(--plan-selection)"
                  />
                </g>
              ))}
          {selection.kind === 'opening' && <polygon points={selectionPoints(design, selection).map(p=>p.join(',')).join(' ')} fill="none" stroke="var(--plan-selection)" strokeWidth={2/view.s} pointerEvents="none"/>}
          {["wall", "opening"].includes(selection.kind) &&
            design.walls
              .filter(
                (w) =>
                  selection.kind === 'wall' && w.id === selection.id,
              )
              .map((w) => (
                <g key={w.id}>
                  <polygon
                    points={wallPolygons.get(w.id)!
                      .map((p) => p.join(","))
                      .join(" ")}
                    fill="none"
                    stroke="var(--plan-selection)"
                    strokeWidth={2 / view.s}
                  />
                  {canResizeWall(design, w) &&
                    selection.kind === "wall" &&
                    (["a", "b"] as const).map((k) => (
                      <circle
                        key={k}
                        data-handle={k}
                        cx={w[k][0]}
                        cy={w[k][1]}
                        r={10 / view.s}
                        fill="var(--plan-porcelain)"
                        stroke="var(--plan-selection)"
                        strokeWidth={2 / view.s}
                      />
                    ))}
                </g>
              ))}
        </g>
      )}
    </svg>
  );
});
function MeasureLine({ a, b, scale }: { a: Point; b: Point; scale: number }) {
  return (
    <g pointerEvents="none">
      <line
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="var(--plan-selection)"
        strokeWidth={1.5 / scale}
      />
      <circle cx={a[0]} cy={a[1]} r={3 / scale} fill="var(--plan-selection)" />
      <circle cx={b[0]} cy={b[1]} r={3 / scale} fill="var(--plan-selection)" />
      <text
        x={(a[0] + b[0]) / 2}
        y={(a[1] + b[1]) / 2 - 8 / scale}
        textAnchor="middle"
        fill="var(--plan-selection)"
        fontSize={12 / scale}
      >
        {formatMeters(Math.hypot(a[0] - b[0], a[1] - b[1]))} m
      </text>
    </g>
  );
}
