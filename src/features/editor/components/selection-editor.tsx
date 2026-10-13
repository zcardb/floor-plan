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
  Ruler,
  Palette,
  CircleDollarSign,
  LockKeyhole,
  GripVertical,
  DoorOpen,
  Loader2,
  Footprints,
  Group,
  Ungroup,
  Shapes,
  Armchair,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { applyRoomFloor, pickableFloors } from "@/lib/floor-plan/floor-materials";
import { WallOptionsMenu } from './wall-options-menu';
import { BEARING_WALL_LOCKED, canDeleteWall, canResizeWall, wallKindName } from '@/lib/floor-plan/wall-policy';
import { length, bbox, inRoom } from "@/lib/floor-plan/geometry";
import { groupIds, isPersistentGroup } from "@/lib/floor-plan/furniture-group";
import { RoomDeleteMenu } from './room-delete-menu';
import { SizeFields } from './size-fields';
import { SeparatorLengthFields } from './separator-length-fields';
import { RoomSidesEditor } from './room-sides-editor';
import { AiIcon } from '@/components/ai-icon/ai-icon';
import { EditorNameInput } from './editor-name-input';
import { LayerMenu } from './layer-menu';
import { OpeningVariantSelect } from './opening-variant-select';
import { FurniturePicker } from '@/components/picker/furniture-picker';
import { RoomMetrics } from './room-metrics';
import { colorThumb, floorThumb, furnitureThumb } from '@/components/material-swatch/material-thumbs';

import type { SizeTransaction } from '../model/size-transaction';
import {
  furnitureKey,
  type PriceGroup,
} from "@/lib/floor-plan/costs";
import { placeEditor, type ScreenRect } from "@/lib/floor-plan/selection-anchor";
import { selectionCost } from "@/lib/floor-plan/cost-breakdown";
import { yuan } from "@/lib/floor-plan/money";
import type { CustomFloor, CustomOpening, CustomWall, Design, Selection } from "@/lib/floor-plan/types";
import { applyRoomWall, openingHeight, openingName, openingPriceKey, pickableOpenings, pickableWalls } from "@/lib/floor-plan/hard-materials";
import { PriceField } from "@/features/costs";
import { ColorPicker } from "@/components/color-picker/color-picker";
import { useCostDesign } from '@/contexts/account-costs/cost-defaults-context';
import { VisualSelectField } from '@/components/picker/visual-select-field';
import { RoomSurfaceFields } from './room-surface-fields';
import { formatMeters } from '@/lib/floor-plan/length-units';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { DoorOrientationControls } from './door-orientation-controls';
import { StairEditor } from './stair-editor';
import { changeDoorOrientation } from '@/lib/floor-plan/door-orientation';
import { doorType } from '@/lib/floor-plan/door-type';
import { DoorTypeMenu } from './door-type-menu';
import { useEditorDrag } from '../hooks/use-editor-drag';
import { separatorLength } from '@/lib/floor-plan/separators';
import type { AiEntryTone } from '@/features/ai-design';
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
  /** 组合 / 解除组合选中的家具；没有多选时不传。 */
  toggleGroup?: () => void;
  remove: () => void;
  close: () => void;
  /** 打开右侧成本面板（房间为本间成本明细）。 */
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
  /** 删除房间（拆本房间独立墙）；不传时下拉里的「删除房间」不可用。 */
  removeRoom?: (roomId: string) => void;
  /** 切换选中对象（房间内家具列表点选）；不传时不显示该列表。 */
  select?: (s: Selection) => void;
  /** 房间「AI 布局」入口；未登录或只读时不传，入口不显示。 */
  roomAi?: { tone: AiEntryTone; open: () => void };
}
export const SelectionEditor = forwardRef<SelectionEditorHandle, Props>(
  function SelectionEditor(p, ref) {
    const costDesign = useCostDesign(p.design);
    const sel = p.selection,
      sid = sel && sel.kind !== "group" ? sel.id : null;
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
      const rectOf = (e: Element) => {
        const a = e.getBoundingClientRect(),
          s = stage.getBoundingClientRect();
        return {
          left: a.left - s.left,
          top: a.top - s.top,
          right: a.right - s.left,
          bottom: a.bottom - s.top,
        };
      };
      const obstacles = [
        ...stage.querySelectorAll(
          ".stage-topline,.canvas-zoom,.scene-light-control,.mobile-library,.mode-hint",
        ),
      ].map(rectOf);
      // 画在 SVG 里的距离标注（门窗两侧净距）与墙端点拖动圆点：编辑栏不要压住它们。
      // 圆点很小，四周再留出一圈手指 / 鼠标可操作的余量。
      const handlePad = 14;
      const keepVisible = [...stage.querySelectorAll("[data-editor-keep-visible]")].map(e => {
        const r = rectOf(e);
        return e.getAttribute("data-editor-keep-visible") === "handle"
          ? { left: r.left - handlePad, top: r.top - handlePad, right: r.right + handlePad, bottom: r.bottom + handlePad }
          : r;
      });
      const pos = placeEditor(
        r,
        { width: stage.clientWidth, height: stage.clientHeight },
        { width: node.offsetWidth, height: node.offsetHeight },
        obstacles,
        keepVisible,
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
    }, [p.stage, sid]);
    useEffect(() => positionRef.current(anchor.current), [p.hidden]);
    const f =
        sel?.kind === "furniture"
          ? p.design.furniture.find((f) => f.id === sid)
          : null,
      w =
        sel?.kind === "wall"
          ? p.design.walls.find((w) => w.id === sid)
          : null,
      r =
        sel?.kind === "room"
          ? p.design.rooms.find((r) => r.id === sid)
          : null,
      o =
        sel?.kind === "opening"
          ? p.design.openings.find((o) => o.id === sid)
          : null,
      separator =
        sel?.kind === "separator"
          ? p.design.separators?.find((l) => l.id === sid)
          : null,
      group = groupIds(p.design, sel);
    const grouped = isPersistentGroup(p.design, group);
    const roomItems = r ? p.design.furniture.filter(f => inRoom([f.cx, f.cy], r)) : [];
    const roomFurniture = roomItems.length;
    // 门窗款式：只有标准款且未换过款式时没有可切换项，不显示入口（与属性面板一致）。
    const hasVariants = !!o && (!!o.variant || pickableOpenings(p.design, p.accountOpenings || [], o.kind).length > 0);
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
                openingHeight(o),
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
    const rename = (name: string) => {
      if (f) p.change(d => ({ ...d, furniture: d.furniture.map(g => g.id === f.id ? { ...g, name } : g) }));
      if (r) p.change(d => ({ ...d, rooms: d.rooms.map(g => g.id === r.id ? { ...g, name } : g) }));
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
    if (!f && !w && !r && !o && !separator && group.length < 2) return null;
    // 工具条直接显示选中对象的金额贡献：房间为本间合计，家具为单价，门窗/墙体为施工金额。
    const cost = p.showCosts ? selectionCost(costDesign, p.selection) : null,
      costLabel =
        cost?.amount === null || cost === null
          ? "未定价"
          : yuan(cost.amount);
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
        {/* 房间、家具的名称可直接在工具条里改；其它对象名称由类型决定，只显示。 */}
        {f || r
          ? <EditorNameInput value={(f ?? r)!.name} label={f ? "家具名称" : "房间名称"} onRename={rename} />
          : <span className="visual-object-name">
            {group.length > 1 ? (grouped ? `已组合 ${group.length} 件家具` : `已选中 ${group.length} 件家具`)
              : w ? wallKindName(w) : o ? openingName(p.design, o) : separator ? "房间分隔线" : ""}
          </span>}
        {/* AI 布局是房间的主操作，紧跟在名称后面。 */}
        {r && p.roomAi && (
          <EditorTooltip label={p.roomAi.tone === "running" ? "AI 布局生成中 · 点击查看进度" : p.roomAi.tone === "unseen" ? "AI 布局已生成 · 点击查看" : "AI 布局"}>
            <button type="button" className="visual-ai-trigger" data-tone={p.roomAi.tone} aria-label={p.roomAi.tone === "running" ? "AI 布局生成中" : p.roomAi.tone === "unseen" ? "AI 布局已生成，未查看" : "AI 布局"} aria-busy={p.roomAi.tone === "running" || undefined} onClick={p.roomAi.open}>
              {p.roomAi.tone === "running" ? <Loader2 size={15} className="animate-spin" /> : <AiIcon size={15} />}
              AI 布局
              {p.roomAi.tone === "unseen" && <span className="visual-ai-dot" aria-hidden="true" />}
            </button>
          </EditorTooltip>
        )}
        {separator && (
          <Popover
            open={open === "separator"}
            onOpenChange={(v) => setPanel(v, "separator")}
          >
            <EditorTooltip label="分隔线长度">
              <PopoverTrigger asChild>
                <button className="visual-size-trigger" aria-label="调整分隔线长度">
                  <Ruler size={15} />
                  <span>{formatMeters(separatorLength(separator))} m</span>
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
              <h3>分隔线长度</h3>
              <SeparatorLengthFields key={separator.id} design={p.design} separator={separator} transaction={p.transaction} close={() => setOpen(null)} />
            </PopoverContent>
          </Popover>
        )}
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
                  {BEARING_WALL_LOCKED}
                </p>
              ) : (
                <SizeFields key={sid ?? undefined} design={p.design} selection={p.selection} transaction={p.transaction} close={()=>setOpen(null)}/>
              )}
            </PopoverContent>
          </Popover>
        )}
        {(w || separator || o?.kind === 'passage') && sel && sel.kind !== 'group' && <WallOptionsMenu design={p.design} target={{ kind: sel.kind as 'wall' | 'separator' | 'opening', id: sel.id }} change={p.change} select={p.select} splitWall={p.splitWall} mergeWall={p.mergeWall} removeWall={p.removeWall} />}
        {(f || w) && <ColorPicker label={f ? "家具颜色" : "墙体颜色"} variant="swatch" value={f?.color || w?.color || ""} onChange={paint} />}
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
              <header className="visual-popover-head"><h3>房间尺寸</h3><span>{r.name}</span></header>
              <RoomMetrics room={r} />
              <p className="visual-popover-section">各边长度</p>
              <RoomSidesEditor key={r.id} design={p.design} roomId={r.id} transaction={p.transaction} close={() => setOpen(null)} />
            </PopoverContent>
          </Popover>
        )}
        {r && (
          <Popover
            open={open === "material"}
            onOpenChange={(v) => setPanel(v, "material")}
          >
            <EditorTooltip label="硬装：地面、墙面、屋面、吊顶">
              <PopoverTrigger asChild>
                <button aria-label="房间硬装">
                  <Palette size={15} />
                  硬装
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
            </EditorTooltip>
            <PopoverContent className="visual-editor-popover">
              <header className="visual-popover-head"><h3>硬装</h3><span>{r.name}</span></header>
              <VisualSelectField label="地面" value={r.mat}
                options={pickableFloors(p.design, p.accountFloors || []).map(({ key, material, fromAccount }) => ({ value: key, label: material.name, visual: floorThumb(material), badge: fromAccount ? '账号库' : undefined }))}
                onChange={value => p.change(d => applyRoomFloor(d, r.id, value, p.accountFloors || []))} />
              <VisualSelectField label="墙面" value={r.wallMat || 'paint'}
                options={pickableWalls(p.design, p.accountWalls || []).map(({ key, name, material, fromAccount }) => ({ value: key, label: name, visual: colorThumb(material.color), badge: fromAccount ? '账号库' : undefined }))}
                onChange={value => p.change(d => applyRoomWall(d, r.id, value, p.accountWalls || []))} />
              <RoomSurfaceFields design={p.design} room={r} change={p.change} accountRoofs={p.accountRoofs || []} accountCeilings={p.accountCeilings || []} />
            </PopoverContent>
          </Popover>
        )}
        {/* 房间内家具：与家具选择同一个通用带图下拉（FurniturePicker），左侧为家具 2D 图，选中即切换到该家具。 */}
        {r && p.select && <FurniturePicker label="房间内家具" tooltip="房间内家具 · 点击选中" placeholder="搜索房间内家具…" grouped={false}
          heading={{ title: "房间内家具", meta: `${roomFurniture} 件` }} compact
          items={roomItems.map(item => ({ id: item.id, label: item.name, group: '', hint: `${formatMeters(item.w)} × ${formatMeters(item.d)} m`, keywords: [item.type], visual: furnitureThumb(item) }))}
          onPick={item => p.select!({ kind: "furniture", id: item.id })}
          footer={roomFurniture ? undefined : '从左侧家具库为房间添加家具'}>
          <button type="button" aria-label={`房间内家具 ${roomFurniture} 件`}><Armchair size={15} />家具<span className="visual-trigger-count">{roomFurniture}</span><ChevronDown size={12} /></button>
        </FurniturePicker>}
        {f?.type === 'stairs' && <Popover open={open === 'stair'} onOpenChange={value => setPanel(value, 'stair')}>
          <EditorTooltip label="楼梯类别、梯段宽与踏步数">
            <PopoverTrigger asChild><button type="button" aria-label="编辑楼梯参数"><Footprints size={15} />楼梯<ChevronDown size={12} /></button></PopoverTrigger>
          </EditorTooltip>
          <PopoverContent className="visual-editor-popover stair-popover" side="right" align="start" sideOffset={8} collisionPadding={12}>
            <h3>楼梯</h3>
            <StairEditor design={p.design} furniture={f} change={p.change} />
          </PopoverContent>
        </Popover>}
        {o && hasVariants && <Popover open={open === 'variant'} onOpenChange={value => setPanel(value, 'variant')}>
          <EditorTooltip label="门窗款式">
            <PopoverTrigger asChild><button type="button" aria-label="切换门窗款式"><Shapes size={15} />款式<ChevronDown size={12} /></button></PopoverTrigger>
          </EditorTooltip>
          <PopoverContent className="visual-editor-popover"><h3>{openingName(p.design, o)}款式</h3><OpeningVariantSelect design={p.design} opening={o} accountOpenings={p.accountOpenings} change={p.change} /></PopoverContent>
        </Popover>}
        {o?.kind === 'door' && <DoorTypeMenu design={p.design} door={o} change={p.change} />}
        {o?.kind === 'door' && doorType(o) !== 'sliding' && <Popover open={open === 'direction'} onOpenChange={value => setPanel(value, 'direction')}>
          <EditorTooltip label="门开向">
            <PopoverTrigger asChild><button type="button" aria-label="调整门开向"><DoorOpen size={15} />开向<ChevronDown size={12} /></button></PopoverTrigger>
          </EditorTooltip>
          <PopoverContent className="visual-editor-popover door-orientation-popover" aria-label="门开向"><DoorOrientationControls door={o} onChange={patch => p.change(d => changeDoorOrientation(d, o.id, patch))} /></PopoverContent>
        </Popover>}
        {(f || group.length > 1) && (
          <EditorTooltip label={group.length > 1 ? "整组旋转 90°" : "旋转 90°"} shortcut="R">
            <button type="button" aria-label={group.length > 1 ? "整组旋转 90°" : "旋转 90°"} onClick={p.rotate}>
              <RotateCw size={15} />
            </button>
          </EditorTooltip>
        )}
        {(f || group.length > 1) && (
          <EditorTooltip label={group.length > 1 ? (grouped ? "复制组合" : "复制所选") : "复制对象"} shortcut="Ctrl D">
            <button type="button" aria-label={group.length > 1 ? (grouped ? "复制组合" : "复制所选") : "复制对象"} onClick={p.duplicate}>
              <Copy size={15} />
            </button>
          </EditorTooltip>
        )}
        {group.length > 1 && p.toggleGroup && (
          <EditorTooltip label={grouped ? "解除组合" : "组合"} shortcut={grouped ? "Ctrl Shift G" : "Ctrl G"}>
            <button type="button" aria-label={grouped ? "解除组合" : "组合"} aria-pressed={grouped} onClick={p.toggleGroup}>
              {grouped ? <Ungroup size={15} /> : <Group size={15} />}
            </button>
          </EditorTooltip>
        )}
        {/* 图层：所有家具都显示，固定在金额前面。 */}
        {(f || group.length > 1) && <LayerMenu design={p.design} ids={f ? [f.id] : group} change={p.change} variant="toolbar" />}
        {/* 金额紧挨在删除左边；删除是最后一个操作，后面只剩「取消选择」。 */}
        {/* 房间的金额按钮直接展开右侧本间成本面板（单价在面板里逐项调整），没有下拉。 */}
        {p.showCosts && r && (
          <EditorTooltip label="本间成本 · 点击查看明细">
            <button type="button" className="visual-cost-trigger" aria-label={`本间成本 ${costLabel}，查看明细`} onClick={p.costs}>
              <CircleDollarSign size={15} />
              <span className={cost?.amount === null ? "is-unpriced" : ""}>{costLabel}</span>
            </button>
          </EditorTooltip>
        )}
        {p.showCosts && price && (
          <Popover
            open={open === "price"}
            onOpenChange={(v) => setPanel(v, "price")}
          >
            <EditorTooltip label="调整单价">
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
              <button className="visual-cost-link" onClick={p.costs}>
                查看软装 / 硬装成本
              </button>
            </PopoverContent>
          </Popover>
        )}
        {(f || o || deletableWall || separator || group.length > 1) && (
          <EditorTooltip label={group.length > 1 ? "删除选中家具" : "删除对象"} shortcut="Delete">
            <button type="button" aria-label={group.length > 1 ? "删除选中家具" : "删除对象"} onClick={p.remove}>
              <Trash2 size={15} />
            </button>
          </EditorTooltip>
        )}
        {r && <RoomDeleteMenu furniture={roomFurniture} clear={p.remove} removeRoom={p.removeRoom ? () => p.removeRoom!(r.id) : undefined} />}
        <EditorTooltip label="取消选择" shortcut="Esc">
          <button type="button" aria-label="取消选择" onClick={p.close}>
            <X size={15} />
          </button>
        </EditorTooltip>
      </div>
    );
  },
);
