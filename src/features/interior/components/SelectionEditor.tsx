import {
  forwardRef,
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
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { applyRoomFloor, floorMaterialOf, pickableFloors } from "../model/floorMaterials";
import { WallOptionsMenu } from './WallOptionsMenu';
import { canDeleteWall, canResizeWall, wallKindName } from '../model/wallPolicy';
import { length, bbox } from "../model/geometry";
import { SizeFields } from './SizeFields';
import { RoomSidesEditor } from './RoomSidesEditor';

import type { SizeTransaction } from '../model/sizeTransaction';
import {
  furnitureKey,
  type PriceGroup,
} from "../model/costs";
import { placeEditor, type ScreenRect } from "../model/selectionAnchor";
import { selectionCost } from "../model/costBreakdown";
import { yuan } from "../model/money";
import type { CustomFloor, CustomOpening, CustomWall, Design, Selection } from "../model/types";
import { applyRoomWall, openingName, openingPriceKey, pickableWalls } from "../model/hardMaterials";
import { PriceField } from "./PriceField";
import { ColorSwatches } from "./ColorSwatches";
import { useCostDesign } from './CostDefaultsContext';
import { MaterialProcurementEditor } from "./MaterialProcurementEditor";
import { EditorSelect } from './EditorSelect';
import { RoomSurfaceFields } from './RoomSurfaceFields';
import { formatMeters } from '../model/lengthUnits';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DoorOrientationControls } from './DoorOrientationControls';
import { changeDoorOrientation } from '../model/doorOrientation';
import { useEditorDrag } from './useEditorDrag';
import type { AiEntryTone } from '../ai/useRoomAi';
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
  /** 账号地面库；未加入项目的地面也可直接选择，选中后自动加入项目。 */
  accountFloors?: CustomFloor[];
  /** 账号墙面库、门窗库；选用后自动加入项目。 */
  accountWalls?: CustomWall[];
  accountOpenings?: CustomOpening[];
  /** 账号屋面库、吊顶库；选用后自动加入项目。 */
  accountRoofs?: CustomWall[];
  accountCeilings?: CustomWall[];
  splitWall?: (wallId: string) => void;
  mergeWall?: (wallId: string) => void;
  /** 删除墙体（与属性面板的「删除隔墙」共用同一实现）。 */
  removeWall?: (wallId: string) => void;
  /** 房间「AI 布局」入口；未登录或只读时不传，入口不显示。 */
  roomAi?: { tone: AiEntryTone; open: () => void };
}
export const SelectionEditor = forwardRef<SelectionEditorHandle, Props>(
  function SelectionEditor(p, ref) {
    const costDesign = useCostDesign(p.design);
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
    const deletableWall = w && canDeleteWall(w);
    const resizableWall = w && canResizeWall(p.design, w);
    const fields = f
      ? [
          ["w", "宽度 / m", f.w],
          ["d", f.type === 'stairs' ? "长度 / m" : "深度 / m", f.d],
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
        key: openingPriceKey(o),
        name: openingName(p.design, o),
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
    // 工具条直接显示选中对象的金额贡献：房间为本间合计，家具为单价，门窗/墙体为施工金额。
    const cost = p.showCosts ? selectionCost(costDesign, p.selection) : null,
      costLabel =
        cost?.amount === null || cost === null
          ? "未定价"
          : (r ? "本间 " : "") + yuan(cost.amount);
    return (
      <div
        ref={el}
        className="visual-selection-editor"
        role="toolbar"
        aria-label="选中对象编辑工具条"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <EditorTooltip label="拖动工具条">
          <Button type="button" variant="ghost" size="icon" className="visual-editor-drag-handle" aria-label="拖动编辑工具条" {...editorDrag.handlers}><GripVertical size={15} /></Button>
        </EditorTooltip>
        <span className="visual-object-name">
          {f?.name ||
            r?.name ||
            (w ? wallKindName(w) : o ? openingName(p.design, o) : "")}
        </span>
        {fields.length > 0 && (
          <Popover
            open={open === "size"}
            onOpenChange={(v) => setPanel(v, "size")}
          >
            <EditorTooltip
              label="尺寸与位置"
            >
              <PopoverTrigger asChild>
                <button className="visual-size-trigger" aria-label="调整尺寸与位置">
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
            </EditorTooltip>
            <PopoverContent
              className="visual-editor-popover"
              side="bottom"
              align="start"
              collisionPadding={12}
            >
              <h3>尺寸与位置</h3>
              {w && !resizableWall ? (
                <p className="visual-locked">
                  <LockKeyhole size={15} />
                  此项目创建时锁定了结构尺寸，复制该项目后副本可自由调整。
                </p>
              ) : (
                <SizeFields key={p.selection?.id} design={p.design} selection={p.selection} transaction={p.transaction} close={()=>setOpen(null)}/>
              )}
            </PopoverContent>
          </Popover>
        )}
        {w && <WallOptionsMenu design={p.design} wall={w} change={p.change} splitWall={p.splitWall} mergeWall={p.mergeWall} removeWall={p.removeWall} />}
        {(f || w) && (
          <EditorTooltip label="常用颜色">
            <ColorSwatches value={f?.color || w?.color || ""} onPick={paint} />
          </EditorTooltip>
        )}
        {r && (
          <Popover
            open={open === "roomsize"}
            onOpenChange={(v) => setPanel(v, "roomsize")}
          >
            <EditorTooltip label="房间逐边尺寸">
              <PopoverTrigger asChild>
                <button className="visual-size-trigger" aria-label="调整房间各边长度">
                  <Ruler size={15} />
                  <span>
                    {formatMeters(bbox(r.rings[0]).x2 - bbox(r.rings[0]).x)} × {formatMeters(bbox(r.rings[0]).y2 - bbox(r.rings[0]).y)} m
                  </span>
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
            </EditorTooltip>
            <PopoverContent
              className="visual-editor-popover room-size-popover"
              side="bottom"
              align="start"
              collisionPadding={12}
            >
              <h3>房间尺寸</h3>
              <RoomSidesEditor key={r.id} design={p.design} roomId={r.id} transaction={p.transaction} close={() => setOpen(null)} />
            </PopoverContent>
          </Popover>
        )}
        {r && p.roomAi && (
          <EditorTooltip label={p.roomAi.tone === "running" ? "AI 布局生成中 · 点击查看进度" : p.roomAi.tone === "unseen" ? "AI 布局已生成 · 点击查看" : "AI 布局"}>
            <button type="button" className="visual-ai-trigger" data-tone={p.roomAi.tone} aria-label={p.roomAi.tone === "running" ? "AI 布局生成中" : p.roomAi.tone === "unseen" ? "AI 布局已生成，未查看" : "AI 布局"} aria-busy={p.roomAi.tone === "running" || undefined} onClick={p.roomAi.open}>
              {p.roomAi.tone === "running" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              AI 布局
              {p.roomAi.tone === "unseen" && <span className="visual-ai-dot" aria-hidden="true" />}
            </button>
          </EditorTooltip>
        )}
        {r && (
          <Popover
            open={open === "material"}
            onOpenChange={(v) => setPanel(v, "material")}
          >
            <EditorTooltip label="房间材质">
              <PopoverTrigger asChild>
                <button aria-label="房间材质">
                  <Palette size={15} />
                  材质
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
            </EditorTooltip>
            <PopoverContent className="visual-editor-popover">
              <h3>房间材质</h3>
              <EditorSelect label="地面" value={r.mat}
                options={pickableFloors(p.design, p.accountFloors || []).map(({ key, material, fromAccount }) => ({ value: key, label: fromAccount ? `${material.name} · 账号库` : material.name }))}
                onChange={value => p.change(d => applyRoomFloor(d, r.id, value, p.accountFloors || []))} />
              <EditorSelect label="墙面" value={r.wallMat || 'paint'}
                options={pickableWalls(p.design, p.accountWalls || []).map(({ key, name, fromAccount }) => ({ value: key, label: fromAccount ? `${name} · 账号库` : name }))}
                onChange={value => p.change(d => applyRoomWall(d, r.id, value, p.accountWalls || []))} />
              <RoomSurfaceFields design={p.design} room={r} change={p.change} accountRoofs={p.accountRoofs || []} accountCeilings={p.accountCeilings || []} />
            </PopoverContent>
          </Popover>
        )}
        {o?.kind === 'door' && <Popover open={open === 'direction'} onOpenChange={value => setPanel(value, 'direction')}>
          <EditorTooltip label="门开向">
            <PopoverTrigger asChild><button type="button" aria-label="调整门开向"><DoorOpen size={15} />开向<ChevronDown size={12} /></button></PopoverTrigger>
          </EditorTooltip>
          <PopoverContent className="visual-editor-popover"><h3>门开向</h3><DoorOrientationControls door={o} onChange={patch => p.change(d => changeDoorOrientation(d, o.id, patch))} /></PopoverContent>
        </Popover>}
        {p.showCosts && price && (
          <Popover
            open={open === "price"}
            onOpenChange={(v) => setPanel(v, "price")}
          >
            <EditorTooltip
              label={r ? "本间成本 · 调整单价" : "调整单价"}
            >
              <PopoverTrigger asChild>
                <button
                  className="visual-cost-trigger"
                  aria-label={`调整单价，当前${costLabel}`}
                >
                  <CircleDollarSign size={15} />
                  <span className={cost?.amount === null ? "is-unpriced" : ""}>
                    {costLabel}
                  </span>
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
            </EditorTooltip>
            <PopoverContent className="visual-editor-popover">
              <h3>{price.name}单价</h3>
              <PriceField
                key={price.group + price.key}
                design={p.design}
                group={price.group}
                priceKey={price.key}
                name={price.name}
                unit={price.unit}
                change={p.change}
              />
              {price.group === "floorPrices" && (
                <MaterialProcurementEditor
                  design={p.design}
                  material={price.key}
                  change={p.change}
                />
              )}
              <button className="visual-cost-link" onClick={p.costs}>
                {r ? "查看本间成本明细" : "查看软装 / 硬装成本"}
              </button>
            </PopoverContent>
          </Popover>
        )}
        {f && (
          <>
            <EditorTooltip label="旋转 90°" shortcut="R">
              <button type="button" aria-label="旋转 90°" onClick={p.rotate}>
                <RotateCw size={15} />
              </button>
            </EditorTooltip>
            <EditorTooltip label="复制对象" shortcut="Ctrl D">
              <button type="button" aria-label="复制对象" onClick={p.duplicate}>
                <Copy size={15} />
              </button>
            </EditorTooltip>
          </>
        )}
        {(f || o || deletableWall) && (
          <EditorTooltip
            label="删除对象"
            shortcut="Delete"
          >
            <button type="button" aria-label="删除对象" onClick={p.remove}>
              <Trash2 size={15} />
            </button>
          </EditorTooltip>
        )}
        <EditorTooltip label="详细属性">
          <button type="button" aria-label="详细属性" onClick={p.details}>
            <Settings2 size={15} />
          </button>
        </EditorTooltip>
        <EditorTooltip label="取消选择" shortcut="Esc">
          <button type="button" aria-label="取消选择" onClick={p.close}>
            <X size={15} />
          </button>
        </EditorTooltip>
      </div>
    );
  },
);
