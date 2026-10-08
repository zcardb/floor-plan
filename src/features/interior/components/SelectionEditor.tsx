import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Copy,
  RotateCw,
  Trash2,
  X,
  Settings2,
  Ruler,
  Palette,
  CircleDollarSign,
  LockKeyhole,
  GripVertical,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { floorMaterialOf, floorMaterialsOf } from "../model/floorMaterials";
import { FURNITURE_COLORS } from "../data/palette";
import { WallBearingControls } from './WallBearingControls';
import { canEditWall, openingIsLocked, wallKindName } from '../model/wallPolicy';
import { length } from "../model/geometry";
import { SizeFields } from './SizeFields';

import type { SizeTransaction } from '../model/sizeTransaction';
import {
  furnitureKey,
  priceOf,
  setPrice,
  wallMaterials,
  type PriceGroup,
} from "../model/costs";
import { placeEditor, type ScreenRect } from "../model/selectionAnchor";
import type { Design, Selection } from "../model/types";
import { PriceInput } from "./PriceInput";
import { CostDefaultsContext, useCostDesign } from './CostDefaultsContext';
import { MaterialProcurementEditor } from "./MaterialProcurementEditor";
import { EditorSelect } from './EditorSelect';
import { formatMeters } from '../model/lengthUnits';
import { Button } from '@/components/ui/button';
import { DoorOrientationControls } from './DoorOrientationControls';
import { changeDoorOrientation } from '../model/doorOrientation';
import { useEditorDrag } from './useEditorDrag';
export interface SelectionEditorHandle {
  update: (r: ScreenRect | null) => void;
}
interface Props {
  design: Design;
  selection: Selection;
  stage: React.RefObject<HTMLElement | null>;
  change: (fn: (d: Design) => Design) => void;
  rotate: () => void;
  duplicate: () => void;
  remove: () => void;
  close: () => void;
  details: () => void;
  costs: () => void;
  hidden: boolean;
  showCosts: boolean;
  transaction: SizeTransaction;
}
const colors = FURNITURE_COLORS;
export const SelectionEditor = forwardRef<SelectionEditorHandle, Props>(
  function SelectionEditor(p, ref) {
    const costDesign = useCostDesign(p.design), defaults = useContext(CostDefaultsContext);
    const el = useRef<HTMLDivElement>(null),
      [open, setOpen] = useState<string | null>(null),
      latest = useRef(p),
      anchor = useRef<ScreenRect | null>(null);
    latest.current = p;
    const editorDrag = useEditorDrag(el, p.stage, () => setOpen(null));
    const position = (r: ScreenRect | null) => {
      anchor.current = r;
      const node = el.current,
        stage = latest.current.stage.current;
      if (!node || !stage) return;
      const obstacles = [
        ...stage.querySelectorAll(
          ".stage-topline,.canvas-zoom,.scene-light-control,.mobile-library,.mode-hint",
        ),
      ].map((e) => {
        const a = e.getBoundingClientRect(),
          s = stage.getBoundingClientRect();
        return {
          left: a.left - s.left,
          top: a.top - s.top,
          right: a.right - s.left,
          bottom: a.bottom - s.top,
        };
      });
      const pos = placeEditor(
        r,
        { width: stage.clientWidth, height: stage.clientHeight },
        { width: node.offsetWidth, height: node.offsetHeight },
        obstacles,
      );
      node.style.visibility =
        pos && !latest.current.hidden ? "visible" : "hidden";
      node.style.pointerEvents =
        pos && !latest.current.hidden ? "auto" : "none";
      if (pos && (editorDrag.manual.current || !node.contains(document.activeElement))) editorDrag.place(pos);
    };
    const positionRef = useRef(position);
    positionRef.current = position;
    useImperativeHandle(ref, () => ({ update: r => positionRef.current(r) }));
    useEffect(() => {
      const node = el.current,
        stage = p.stage.current;
      if (!node || !stage) return;
      const observer = new ResizeObserver(() => positionRef.current(anchor.current));
      observer.observe(node);
      observer.observe(stage);
      return () => observer.disconnect();
    }, [p.stage, p.selection?.id]);
    useEffect(() => positionRef.current(anchor.current), [p.hidden]);
    const f =
        p.selection?.kind === "furniture"
          ? p.design.furniture.find((f) => f.id === p.selection!.id)
          : null,
      w =
        p.selection?.kind === "wall"
          ? p.design.walls.find((w) => w.id === p.selection!.id)
          : null,
      r =
        p.selection?.kind === "room"
          ? p.design.rooms.find((r) => r.id === p.selection!.id)
          : null,
      o =
        p.selection?.kind === "opening"
          ? p.design.openings.find((o) => o.id === p.selection!.id)
          : null;
    const editableWall =
      w && canEditWall(p.design, w);
    const fields = f
      ? [
          ["w", "宽 / m", f.w],
          ["d", f.type === 'stairs' ? "长 / m" : "深 / m", f.d],
          ["cx", "中心 X / m", f.cx],
          ["cy", "中心 Y / m", f.cy],
          ["rot", "旋转 / °", f.rot],
        ]
      : w
        ? [
            ["length", "长度 / m", length(w)],
            ["thickness", "墙厚 / m", w.thickness],
          ]
        : o
          ? [
              ["width", "宽度 / m", o.width],
              ["offset", "沿墙位置 / m", o.offset],
              [
                "height",
                "高度 / m",
                o.height ?? (o.kind === "door" ? 2100 : 1600),
              ],
              ...(o.kind === "window"
                ? [["sill", "窗台高 / m", o.sill ?? 800]]
                : []),
            ]
          : [];
    const setPanel = (v: boolean, key: string) => {
      setOpen(v ? key : null);
      position(anchor.current);
    };
    const paint = (value: string) => {
      if (f)
        p.change((d) => ({
          ...d,
          furniture: d.furniture.map((g) =>
            g.id === f.id ? { ...g, color: value } : g,
          ),
        }));
      if (w)
        p.change((d) => ({
          ...d,
          walls: d.walls.map((g) =>
            g.id === w.id ? { ...g, color: value } : g,
          ),
        }));
    };
    let price: {
      group: PriceGroup;
      key: string;
      name: string;
      unit: string;
    } | null = null;
    if (f)
      price = {
        group: "furniturePrices",
        key: furnitureKey(f),
        name: f.name,
        unit: "件",
      };
    else if (r)
      price = {
        group: "floorPrices",
        key: r.mat,
        name: floorMaterialOf(p.design, r.mat).name,
        unit: costDesign.costSettings?.procurement?.[r.mat]?.unit || "m²",
      };
    else if (o)
      price = {
        group: "openingPrices",
        key: o.kind,
        name: o.kind === "door" ? "门" : "窗",
        unit: "m²",
      };
    else if (w)
      price = {
        group: "constructionPrices",
        key: p.design.demolished.includes(w.id) ? "demolish" : "build",
        name: "墙体施工",
        unit: "m²",
      };
    if (!f && !w && !r && !o) return null;
    return (
      <div
        ref={el}
        className="visual-selection-editor"
        role="toolbar"
        aria-label="选中对象编辑工具条"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button type="button" variant="ghost" size="icon" className="visual-editor-drag-handle" aria-label="拖动编辑工具条" title="拖动工具条，或用方向键移动" {...editorDrag.handlers}><GripVertical size={15} /></Button>
        <span className="visual-object-name">
          {f?.name ||
            r?.name ||
            (w ? wallKindName(w) : o?.kind === "door" ? "门" : "窗")}
        </span>
        {fields.length > 0 && (
          <Popover
            open={open === "size"}
            onOpenChange={(v) => setPanel(v, "size")}
          >
            <PopoverTrigger asChild>
              <button title="调整尺寸" className="visual-size-trigger">
                <Ruler size={15} />
                <span>
                  {f
                    ? `${formatMeters(f.w)} × ${formatMeters(f.d)} m`
                    : w
                      ? `${formatMeters(length(w))} m`
                      : `${formatMeters(o?.width ?? 0)} m`}
                </span>
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="visual-editor-popover"
              side="bottom"
              align="start"
              collisionPadding={12}
            >
              <h3>尺寸与位置</h3>
              {w && !editableWall ? (
                <p className="visual-locked">
                  <LockKeyhole size={15} />
                  建筑结构已锁定，不能修改尺寸。
                </p>
              ) : (
                <SizeFields design={p.design} selection={p.selection} transaction={p.transaction} close={()=>setOpen(null)}/>
              )}
            </PopoverContent>
          </Popover>
        )}
        {w && <Popover open={open === 'bearing'} onOpenChange={value => setPanel(value, 'bearing')}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" aria-label="墙体承重属性">承重<ChevronDown size={12} /></Button></PopoverTrigger>
          <PopoverContent className="visual-editor-popover"><h3>墙体承重属性</h3><WallBearingControls design={p.design} wall={w} change={p.change} /></PopoverContent>
        </Popover>}
        {(f || w) && (
          <div className="visual-colors" aria-label="常用颜色">
            {colors.map((c) => (
              <button
                key={c}
                className={(f?.color || w?.color) === c ? "selected" : ""}
                style={{ background: c }}
                title={"设置颜色 " + c}
                aria-label={"设置颜色 " + c}
                onClick={() => paint(c)}
              />
            ))}
            <label className="visual-custom-color" title="自定义颜色">
              <Palette size={15} />
              <input
                type="color"
                value={f?.color || w?.color || "#eee9de"}
                onChange={(e) => paint(e.target.value)}
              />
            </label>
          </div>
        )}
        {r && (
          <Popover
            open={open === "material"}
            onOpenChange={(v) => setPanel(v, "material")}
          >
            <PopoverTrigger asChild>
              <button>
                <Palette size={15} />
                材质
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="visual-editor-popover">
              <h3>房间材质</h3>
              <EditorSelect label="地面" value={r.mat}
                options={Object.entries(floorMaterialsOf(p.design)).map(([value, m]) => ({ value, label: m.name }))}
                onChange={value => p.change(d => ({ ...d, rooms: d.rooms.map(g => g.id === r.id ? { ...g, mat: value } : g) }))} />
              <EditorSelect label="墙面" value={r.wallMat || 'paint'}
                options={Object.entries(wallMaterials).map(([value, m]) => ({ value, label: m.name }))}
                onChange={value => p.change(d => ({ ...d, rooms: d.rooms.map(g => g.id === r.id ? { ...g, wallMat: value } : g) }))} />
            </PopoverContent>
          </Popover>
        )}
        {o?.kind === 'door' && <Popover open={open === 'direction'} onOpenChange={value => setPanel(value, 'direction')}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="visual-door-direction" aria-label="调整门开向"><DoorOpen size={15} />开向<ChevronDown size={12} /></Button></PopoverTrigger>
          <PopoverContent className="visual-editor-popover"><h3>门开向</h3><DoorOrientationControls door={o} onChange={patch => p.change(d => changeDoorOrientation(d, o.id, patch))} /></PopoverContent>
        </Popover>}
        {p.showCosts && price && (
          <Popover
            open={open === "price"}
            onOpenChange={(v) => setPanel(v, "price")}
          >
            <PopoverTrigger asChild>
              <button title="调整单价">
                <CircleDollarSign size={16} />
                <ChevronDown size={11} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="visual-editor-popover">
              <h3>
                {price.name}单价 · 元/{price.unit}
              </h3>
              <p>修改影响当前项目所有同款／同材质对象。</p>
              <PriceInput
                key={
                  price.group +
                  price.key +
                  priceOf(costDesign, price.group, price.key)
                }
                value={priceOf(costDesign, price.group, price.key)}
                onApply={(v) => {
                  try {
                    p.change((d) => setPrice(d, price!.group, price!.key, v, defaults));
                  } catch {
                    toast.error("价格无效");
                  }
                }}
              />
              {price.group === "floorPrices" && (
                <MaterialProcurementEditor
                  design={p.design}
                  material={price.key}
                  change={p.change}
                />
              )}
              <button className="visual-cost-link" onClick={p.costs}>
                查看软装 / 硬装成本
              </button>
            </PopoverContent>
          </Popover>
        )}
        {f && (
          <>
            <button type="button" aria-label="旋转 90°" title="旋转" onClick={p.rotate}>
              <RotateCw size={15} />
            </button>
            <button aria-label="复制对象" onClick={p.duplicate}>
              <Copy size={15} />
            </button>
          </>
        )}
        {(f || (o && !openingIsLocked(p.design, o.wallId)) || editableWall) && (
          <button aria-label="删除对象" onClick={p.remove}>
            <Trash2 size={15} />
          </button>
        )}
        <button aria-label="详细属性" onClick={p.details}>
          <Settings2 size={16} />
        </button>
        <button aria-label="取消选择" onClick={p.close}>
          <X size={15} />
        </button>
      </div>
    );
  },
);
