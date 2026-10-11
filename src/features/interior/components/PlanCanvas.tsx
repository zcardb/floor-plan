import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessage, notify } from "@/lib/notify";
import { rasterSize } from "@/lib/platform";
import { canResizeWall, isBearingWall, isOnBearingWall, BEARING_WALL_WARNING } from '../model/wallPolicy';
import { syncRooms } from '../model/roomFollow';
import { splitAtJunctions } from '../model/wallAutoSplit';
import { followWallFurniture } from '../model/furnitureFollow';
import { moveWallWithJoints } from '../model/wallMove';
import { keepOpeningsInPlace, openingsFitWalls } from '../model/openingAnchor';
import { dragStep, snapToDragStep, stepDelta } from '../model/dragStep';
import {
  area,
  center,
  length,
  nearestOnWall,
  norm,
  roomPath,
} from "../model/geometry";
import { sameGuides, type AlignmentGuide } from '../model/furnitureAlignment';
import { dragUnit } from '../model/movableUnit';
import { AlignmentGuides } from './AlignmentGuides';
import {
  isOpeningTool,
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
import { resolveWallPoint,steppedPointOnWall,validateWallSegment,type WallSnap } from '../model/wallDrawing';
import { useWallDrawing } from './useWallDrawing';
import { useSeparatorDrawing } from './useSeparatorDrawing';
import { PlanSeparators } from './PlanSeparators';
import { moveSeparatorBy, moveSeparatorEnd } from '../model/separators';
import { separatorEndTarget, separatorShift } from '../model/separatorDrag';
import { OpeningDistances } from './OpeningDistances';
import { connectedWallPoly } from '../model/wallConnections';
import { WallHoverOverlay } from './WallHoverOverlay';
import { formatMeters } from '../model/lengthUnits';
import { perimeterDimensions, planDrawingBounds, type DimensionSegment } from '../model/perimeterDimensions';
import type { DimensionBinding } from '../model/dimensionBinding';
import { PerimeterDimensions } from './PerimeterDimensions';
import { doorOrientation } from '../model/doorOrientation';
import { openingKindLabel } from '../model/hardMaterials';
import { placeOpening } from '../model/openingPlacement';
import { dragOpening } from '../model/openingDrag';
import { isCompletionClick, supportsPointerCompletion } from '../model/toolCompletion';
import { createWheelIntent } from '../model/wheelIntent';
import { expandToGroups, furnitureCorners, furnitureInRect, groupBounds, groupIds, normalizeRect, persistentGroupOf, selectionOf, type Rect } from '../model/furnitureGroup';
export interface CanvasHandle {
  zoom: (k: number) => void;
  fit: () => void;
  ratio: (r: number) => void;
  /** 生成 2D 平面图 PNG；保存与提示由调用方统一处理。 */
  exportImage: () => Promise<Blob>;
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
  onAnchor: (r: ScreenRect | null) => void;
  finishTool: () => void;
  /** 选择模式单击墙身时切到绘墙工具（起点由画布设置）。 */
  startWallTool?: () => void;
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
  /** 拖动家具（单件或整组）时作为一个可移动单位的家具。 */
  ids?: string[];
  /** 框选的当前角点（图纸坐标）。 */
  end?: Point;
  room?: string;
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
    onAnchor,
    finishTool,
    startWallTool,
    onDimensionSelect,
    selectedDimension,
  },
  ref,
) {
  const svg = useRef<SVGSVGElement>(null),
    current = useRef(design);
  current.current = design;
  const [box, setBox] = useState<Rect | null>(null);
  /** 按住空格：左键拖动临时变为平移画布。 */
  const [spacePan, setSpacePan] = useState(false), spaceHeld = useRef(false);
  spaceHeld.current = spacePan;
  /** 正在拖动分隔线（端点或整线）：在线旁标注实时长度。 */
  const [separatorDragging, setSeparatorDragging] = useState(false);
  const group = groupIds(design, selection);
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
  /** 选择模式单击墙身进入绘墙时的墙与起点；紧接着双击即选中这面墙。 */
  const wallClickStart = useRef<{ wallId: string; point: Point } | null>(null);
  const wallDrawing = useWallDrawing(tool === 'wall', current, view.s, layers.snap, commit, finishTool);
  const separatorDrawing = useSeparatorDrawing(tool === 'separator', current, view.s, layers.snap, commit, finishTool);
  // 选择模式悬停墙体时的测距点（与绘墙悬停共用 WallHoverOverlay）。
  const [selectHover, setSelectHover] = useState<WallSnap | null>(null);
  const clearSelectHover = () => setSelectHover(h => (h ? null : h));
  /** 墙身上的绘墙起点：端点、洞口边吸附优先，否则在该墙上沿墙按拖动步进取整（悬停圆点与单击起点一致）。 */
  const wallStartPoint = (p: Point, wallId: string): WallSnap => {
    const d = current.current, snapped = resolveWallPoint(p, d, vr.current.s, layers.snap);
    if (snapped.target?.kind === 'endpoint' || snapped.target?.kind === 'opening') return snapped;
    const wall = d.walls.find(w => w.id === wallId)!;
    return { point: steppedPointOnWall(p, wall, dragStep(d)), target: { wallId, kind: 'intersection' } };
  };
  const hoverWall = (target: EventTarget | null, p: Point) => {
    const id = (target as Element | null)?.closest?.('[data-wall]')?.getAttribute('data-wall');
    const wall = id ? current.current.walls.find(w => w.id === id) : undefined;
    if (!wall || current.current.demolished.includes(wall.id)) return clearSelectHover();
    setSelectHover(wallStartPoint(p, wall.id));
  };
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
      (selection?.kind === "furniture" || selection?.kind === "group") && !layers.furn
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
    const el = svg.current!, intent = createWheelIntent();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (intent(e) === 'pan') {
        // 触控板双指滑动：只平移画布。
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
        setView(v => ({ ...v, x: v.x + (e.deltaX * unit) / v.s, y: v.y + (e.deltaY * unit) / v.s }));
        return;
      }
      const r = el.getBoundingClientRect();
      // 触控板捏合的增量远小于鼠标滚轮，放大系数让两者手感接近。
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), [
        e.clientX - r.left,
        e.clientY - r.top,
      ]);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      e.preventDefault();
      if (!e.repeat) setSpacePan(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpacePan(false); };
    const blur = () => setSpacePan(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
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
        h = b.y2 - b.y + m * 2,
        size = rasterSize(w, h);
      clone.setAttribute("viewBox", `${b.x - m} ${b.y - m} ${w} ${h}`);
      clone.setAttribute("width", String(size.width));
      clone.setAttribute("height", String(size.height));
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
      return new Promise<Blob>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })),
          img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          const c = document.createElement("canvas");
          c.width = size.width;
          c.height = size.height;
          const ctx = c.getContext("2d");
          if (!ctx) return reject(new Error("设备画布内存不足，无法生成图片"));
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("浏览器未能生成图片，请重试"))), "image/png");
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("图纸渲染失败，请重试"));
        };
        img.src = url;
      });
    },
  }));
  const finish = (cancel = false) => {
    const dr = drag.current;
    drag.current = null;
    showGuides([]);
    setBox(null);
    setSeparatorDragging(false);
    if (!dr) return;
    if (cancel) {
      preview(dr.before);
      return;
    }
    const d = current.current;
    if (dr.kind === 'sepmove' || dr.kind === 'sependpoint') {
      if (!dr.moved || d === dr.before) return;
      commit(d, dr.before);
      if (d.rooms.length !== dr.before.rooms.length) notify.info("房间划分已更新，请检查名称与地面材质");
      return;
    }
    if (dr.kind === 'marquee') {
      // 点击（没有拖出框）：选中房间或取消选择。框到组合里任意一件即选中整组。
      if (!dr.moved || !dr.end) return select(dr.room ? { kind: 'room', id: dr.room } : null);
      return select(layers.furn ? selectionOf(expandToGroups(d, furnitureInRect(d, normalizeRect(dr.start, dr.end)))) : null);
    }
    if (dr.kind === 'groupmove') {
      // 点了一下没拖：组合里的家具保持整组选中；临时多选里的则改为单选这一件。
      if (!dr.moved) return persistentGroupOf(d, dr.id!).length > 1 ? undefined : select({ kind: 'furniture', id: dr.id! });
      if (d !== dr.before) commit(d, dr.before);
      return;
    }
    if (dr.kind === 'viewpan') return;
    if ((dr.kind === 'wallmove' || dr.kind === 'wallclick') && !dr.moved) {
      // 单击墙身（没有拖动）：切到绘墙，并以吸附点作为第一段墙的起点；双击才选中墙（见 completeTool）。
      if (!startWallTool) return select({ kind: 'wall', id: dr.id! });
      const start = wallStartPoint(dr.start, dr.id!).point;
      select(null);
      startWallTool();
      wallDrawing.start(start);
      wallClickStart.current = { wallId: dr.id!, point: start };
      return;
    }
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
            // 按交接点分割墙段只改墙段划分；房间随后由「墙 + 分隔线」重算。
            next = syncRooms(dr.before, splitAtJunctions(d, dr.id!));
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
    // 单击墙身开画后还没画出任何一段就双击：这是「双击选中墙」。
    const clicked = wallClickStart.current, draftStart = wallDrawing.draft?.a;
    wallClickStart.current = null;
    const selectWall = clicked && draftStart && Math.hypot(draftStart[0] - clicked.point[0], draftStart[1] - clicked.point[1]) < 0.1
      && current.current.walls.some(w => w.id === clicked.wallId) ? clicked.wallId : null;
    wallDrawing.clear();
    separatorDrawing.clear();
    drag.current = null;
    showGuides([]);
    mouseDown.current = null;
    pinch.current = null;
    for (const id of points.current.keys()) {
      if (svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
    }
    points.current.clear();
    finishTool();
    if (selectWall) select({ kind: 'wall', id: selectWall });
  };
  useEffect(() => { mouseDown.current = null; }, [tool]);
  return (
    <svg
      ref={svg}
      className={"plan-canvas tool-" + tool + (readOnly ? " read-only" : "") + (spacePan ? " is-panning" : "")}
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
        // 中键拖动或按住空格拖动：只平移画布（鼠标用户的平移方式；触控板用双指滑动）。
        const viewPan = e.button === 1 || (e.button === 0 && spaceHeld.current);
        if (e.button && !viewPan) return;
        const begin = () => {
        closePanels();
        clearSelectHover();
        const p = mm(e),
          el = e.target as SVGElement;
        points.current.set(e.pointerId, [e.clientX, e.clientY]);
        svg.current!.setPointerCapture(e.pointerId);
        if (points.current.size === 2) {
          finish(true);
          wallDrawing.clear();
          separatorDrawing.clear();
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
        if (viewPan) {
          drag.current = { ...base, kind: 'viewpan' };
          return;
        }
        const wallEl = el.closest("[data-wall]"),
          fid = el.closest("[data-fid]")?.getAttribute("data-fid"),
          wid = wallEl?.getAttribute("data-wall"),
          oid = el.closest("[data-opening]")?.getAttribute("data-opening"),
          handle = el.closest("[data-handle]")?.getAttribute("data-handle"),
          sid = el.closest("[data-separator]")?.getAttribute("data-separator");
        if (readOnly) {
          if (fid) select(selectionOf(persistentGroupOf(design, fid)));
          else if (oid) select({ kind: 'opening', id: oid });
          else if (wid) select({ kind: 'wall', id: wid });
          else base.room = el.closest('[data-room]')?.getAttribute('data-room') || undefined;
          drag.current = base;
          return;
        }
        if (tool === 'wall') {
          select(null); wallDrawing.down(p, e.pointerId, [e.clientX, e.clientY]); return;
        }
        if (tool === 'separator') {
          select(null); separatorDrawing.down(p, e.pointerId, [e.clientX, e.clientY]); return;
        }
        if (tool === 'select' && selection?.kind === 'separator' && (handle === 'sepa' || handle === 'sepb')) {
          // 选中分隔线的端点手柄：沿分隔线方向伸缩。
          drag.current = { ...base, kind: 'sependpoint', id: selection.id, room: handle === 'sepa' ? 'a' : 'b' };
          return;
        }
        if (sid && tool === 'select' && !fid) {
          // 点中即选中；按住拖动时整条线沿法向平移。
          select({ kind: 'separator', id: sid });
          drag.current = { ...base, kind: 'sepmove', id: sid };
          return;
        }
        if (isOpeningTool(tool) && wid) {
          const wall = design.walls.find((w) => w.id === wid)!;
          if (isBearingWall(wall)) {
            notify.fail("承重墙不可新增开口");
            return;
          }
          // 默认宽度放不下时，门 / 窗自动缩到点击处空档的最大宽度
          const placed = placeOpening(design, wall, tool, nearestOnWall(p, wall).offset);
          if ('reason' in placed) {
            notify.fail(placed.reason);
            return;
          }
          const { offset, width } = placed;
          if (placed.fitted) notify.info(`空间不足，${openingKindLabel(tool)}宽已自动调整为 ${formatMeters(width)} m`);
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
          if (selection.kind === 'group') return;
          base.kind = handle === "a" || handle === "b" ? "endpoint" : handle;
          base.id = selection.id;
          base.room = handle;
        } else if (fid && group.includes(fid)) {
          // 拖动整组中的任意一件：整组一起平移。
          base.kind = 'groupmove';
          base.id = fid;
          base.ids = group;
        } else if (fid) {
          // 组合里的家具：点中即选中整组，拖动时整组一起移动。
          const members = persistentGroupOf(design, fid);
          select(selectionOf(members));
          base.kind = members.length > 1 ? 'groupmove' : 'move';
          base.id = fid;
          base.ids = members;
        } else if (oid) {
          select({ kind: "opening", id: oid });
          if (isOpeningTool(tool)) finishTool();
          base.kind = 'openingmove';
          base.id = oid;
        } else if (wid && tool === "select") {
          const w = design.walls.find((w) => w.id === wid)!;
          wallClick.current={id:wid,fraction:nearestOnWall(p,w).offset/length(w)};
          // 墙体双击选中（单击是开始绘墙）；拖动时才选中并移动。
          base.kind = canResizeWall(design, w) ? "wallmove" : "wallclick";
          base.id = wid;
        } else {
          base.room =
            el.closest("[data-room]")?.getAttribute("data-room") || undefined;
          // 选择模式：从空白处或房间上起拖就是框选（单击仍是选中房间 / 取消选择）。
          if (tool === 'select') base.kind = 'marquee';
        }
        drag.current = base;
        };
        // MouseEvent.detail contains the native double-click count; PointerEvent.detail does not.
        if (!viewPan && e.pointerType === 'mouse' && supportsPointerCompletion(tool)) mouseDown.current = begin;
        else begin();
      }}
      onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
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
        if (tool === 'wall') { wallDrawing.move(p); return; }
        if (tool === 'separator') { separatorDrawing.move(p); return; }
        const dr = drag.current;
        if (tool === 'select' && !dr) hoverWall(e.target, p);
        if (!dr) return;
        if (dr.pid !== e.pointerId) return;
        if (Math.hypot(e.clientX - dr.screen[0], e.clientY - dr.screen[1]) > 5 && !dr.moved) {
          dr.moved = true;
          if (dr.kind === 'wallmove') select({ kind: 'wall', id: dr.id! });
          if (dr.kind === 'sepmove' || dr.kind === 'sependpoint') setSeparatorDragging(true);
        }
        if (!dr.moved) return;
        if (dr.kind === 'wallclick') return;
        if (dr.kind === 'sepmove' || dr.kind === 'sependpoint') {
          const step = dragStep(dr.before);
          try {
            if (dr.kind === 'sepmove') {
              preview(moveSeparatorBy(dr.before, dr.id!, separatorShift(dr.before, dr.id!, [p[0] - dr.start[0], p[1] - dr.start[1]], view.s, layers.snap, step)));
            } else {
              const end = dr.room as 'a' | 'b', to = separatorEndTarget(dr.before, dr.id!, end, p, view.s, layers.snap, step);
              if (to) preview(moveSeparatorEnd(dr.before, dr.id!, end, to));
            }
          } catch {
            // 太短或与另一条分隔线重叠：停在最后一次有效位置。
          }
          return;
        }
        if (dr.kind === 'marquee') {
          dr.end = p;
          setBox(normalizeRect(dr.start, p));
          return;
        }
        if (dr.kind === 'move' || dr.kind === 'groupmove') {
          // 单件与整组都是「可移动单位」：同一套步进、吸附、对齐线与挡墙。
          const moved = dragUnit(dr.before, current.current, dr.ids!, [p[0] - dr.start[0], p[1] - dr.start[1]], layers.snap, 8 / view.s);
          preview(moved.design);
          showGuides(moved.guides);
          return;
        }
        if (dr.kind === "pan" || dr.kind === "viewpan") {
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
          if (dr.kind === "rot") {
            const a =
              (Math.atan2(p[1] - f.cy, p[0] - f.cx) * 180) / Math.PI + 90;
            f.rot = norm(e.shiftKey ? a : Math.round(a / 15) * 15);
          }
          if (dr.kind === "size") {
            const a = (f.rot * Math.PI) / 180,
              dx = p[0] - f.cx,
              dy = p[1] - f.cy,
              step = dragStep(next);
            f.w = Math.max(
              100,
              snapToDragStep((dx * Math.cos(a) + dy * Math.sin(a)) * 2, step),
            );
            f.d = Math.max(
              100,
              snapToDragStep((-dx * Math.sin(a) + dy * Math.cos(a)) * 2, step),
            );
          }
        }
        if (wall) {
          if (dr.kind === "wallmove") {
            const L = length(wall);
            // 沿墙 / 垂直墙两个方向分别按步进取整（横平竖直的墙即图纸 x / y）。
            const delta = stepDelta([p[0] - dr.start[0], p[1] - dr.start[1]], dragStep(dr.before),
              [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L]);
            // 墙端连着其他墙时沿连接墙滑动，贴墙家具沿法向跟着走。
            const moved = moveWallWithJoints(dr.before, wall.id, delta);
            if (moved) preview(followWallFurniture(dr.before, moved));
            return;
          } else if (dr.kind === "endpoint") {
            const key = dr.room as "a" | "b",
              other = key === "a" ? wall.b : wall.a,
              start = dr.before.walls.find((w) => w.id === wall.id)![key],
              raw = resolveWallPoint(p,next,view.s,layers.snap,other,wall.id);
            // 没有吸附到确定点时按步进取整端点的位移；吸到墙、端点或洞口边时以吸附为准。
            const q: Point = raw.target ? raw.point
              : [start[0] + snapToDragStep(raw.point[0] - start[0], dragStep(dr.before)),
                 start[1] + snapToDragStep(raw.point[1] - start[1], dragStep(dr.before))];
            wall[key] = q;
            try { validateWallSegment(next,wall.a,wall.b,wall.id); } catch { return; }
            if (length(wall) < 100) return;
            // 拖动端点延长 / 缩短墙时，门窗留在原位（以未动的那一端为基准）。
            const anchored = keepOpeningsInPlace(dr.before, next);
            if (!openingsFitWalls(anchored, [wall.id])) return;
            preview(anchored);
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
        else if (tool === 'separator') separatorDrawing.up(mm(e), e.pointerId, [e.clientX, e.clientY]);
        else finish();
      }}
      onPointerLeave={() => { wallDrawing.clearHover(); separatorDrawing.clearHover(); clearSelectHover(); }}
      onPointerCancel={(e) => {
        points.current.delete(e.pointerId);
        pinch.current = null;
        wallDrawing.clear();
        separatorDrawing.clear();
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
            {o.kind === "passage" ? (
              <>
                {[-o.width / 2, o.width / 2].map((jamb) => (
                  <path
                    key={jamb}
                    d={`M${jamb} ${-w.thickness / 2}V${w.thickness / 2}`}
                    stroke="var(--plan-ink)"
                    strokeWidth={15}
                  />
                ))}
                {[-w.thickness / 2, w.thickness / 2].map((edge) => (
                  <path
                    key={edge}
                    d={`M${-o.width / 2} ${edge}H${o.width / 2}`}
                    stroke="var(--plan-ink)"
                    strokeWidth={8}
                    strokeDasharray="50 40"
                  />
                ))}
              </>
            ) : o.kind === "window" ? (
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
      <PlanSeparators design={design} selectedId={selection?.kind === 'separator' ? selection.id : undefined} scale={view.s} dragging={separatorDragging} />
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
      {tool === 'separator' && separatorDrawing.draft && (
        <g data-export-hide="true" pointerEvents="none">
          <line x1={separatorDrawing.draft.a[0]} y1={separatorDrawing.draft.a[1]} x2={separatorDrawing.draft.b[0]} y2={separatorDrawing.draft.b[1]}
            stroke="var(--plan-selection)" strokeWidth={2 / view.s} strokeDasharray={`${8 / view.s} ${5 / view.s}`} />
          <MeasureLine a={separatorDrawing.draft.a} b={separatorDrawing.draft.b} scale={view.s} />
        </g>
      )}
      {tool === 'separator' && <WallHoverOverlay walls={design.walls} demolished={design.demolished} candidate={separatorDrawing.hover} connection={separatorDrawing.candidate} scale={view.s} />}
      {tool === 'select' && <WallHoverOverlay walls={design.walls} demolished={design.demolished} candidate={selectHover} connection={null} scale={view.s} label={startWallTool && !readOnly ? '点击开始绘墙，双击选中' : undefined} />}
      <AlignmentGuides guides={guides} scale={view.s} />
      {selection?.kind === 'opening' && <OpeningDistances design={design} openingId={selection.id} scale={view.s} />}
      {box && (
        <rect
          data-export-hide="true"
          className="plan-marquee"
          x={box.x1}
          y={box.y1}
          width={box.x2 - box.x1}
          height={box.y2 - box.y1}
          strokeWidth={1.5 / view.s}
          strokeDasharray={`${6 / view.s} ${4 / view.s}`}
          pointerEvents="none"
        />
      )}
      {group.length > 0 && layers.furn && (
        <g data-export-hide="true" className="selection-overlay" pointerEvents="none">
          {design.furniture.filter(f => group.includes(f.id)).map(f => (
            <polygon
              key={f.id}
              points={furnitureCorners(f).map(p => p.join(',')).join(' ')}
              fill="var(--plan-selection-soft)"
              stroke="var(--plan-selection)"
              strokeWidth={1.5 / view.s}
            />
          ))}
          <polygon
            points={groupBounds(design, group).map(p => p.join(',')).join(' ')}
            fill="none"
            stroke="var(--plan-selection)"
            strokeWidth={1.5 / view.s}
            strokeDasharray={`${5 / view.s} ${3 / view.s}`}
          />
        </g>
      )}
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
                        data-editor-keep-visible="handle"
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
