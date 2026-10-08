import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { materials } from "../data/catalog";
import { length } from "../model/geometry";
import { editSelection } from "../model/selectionEdits";
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
}
const colors = [
  "#efe6d8",
  "#c9d6df",
  "#b7c4b0",
  "#d8c7dc",
  "#d6b99a",
  "#9b7250",
  "#3d3a34",
];
export const SelectionEditor = forwardRef<SelectionEditorHandle, Props>(
  function SelectionEditor(p, ref) {
    const el = useRef<HTMLDivElement>(null),
      [open, setOpen] = useState<string | null>(null),
      [draft, setDraft] = useState<Record<string, string>>({}),
      [error, setError] = useState(""),
      latest = useRef(p),
      anchor = useRef<ScreenRect | null>(null);
    latest.current = p;
    const position = (r: ScreenRect | null) => {
      anchor.current = r;
      const node = el.current,
        stage = latest.current.stage.current;
      if (!node || !stage) return;
      const obstacles = [
        ...stage.querySelectorAll(
          ".stage-topline,.canvas-zoom,.scene-light-control,.mobile-library",
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
      if (pos) node.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)`;
    };
    useImperativeHandle(ref, () => ({ update: position }));
    useEffect(()=>{const node=el.current,stage=p.stage.current;if(!node||!stage)return;const observer=new ResizeObserver(()=>position(anchor.current));observer.observe(node);observer.observe(stage);return ()=>observer.disconnect();},[p.stage,p.selection?.id]);
    useEffect(()=>position(anchor.current),[p.hidden]);
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
      w && p.design.template === "blank" && w.kind === "partition";
    const fields = f
      ? [
          ["w", "宽 / mm", f.w],
          ["d", "深 / mm", f.d],
          ["cx", "中心 X / mm", f.cx],
          ["cy", "中心 Y / mm", f.cy],
          ["rot", "旋转 / °", f.rot],
        ]
      : w
        ? [
            ["length", "长度 / mm", length(w)],
            ["thickness", "墙厚 / mm", w.thickness],
          ]
        : o
          ? [
              ["width", "宽度 / mm", o.width],
              ["offset", "沿墙位置 / mm", o.offset],
              [
                "height",
                "高度 / mm",
                o.height ?? (o.kind === "door" ? 2100 : 1600),
              ],
              ...(o.kind === "window"
                ? [["sill", "窗台高 / mm", o.sill ?? 800]]
                : []),
            ]
          : [];
    const setPanel = (v: boolean, key: string) => {
      setOpen(v ? key : null);
      setError("");
      if (v && key === "size")
        setDraft(
          Object.fromEntries(
            fields.map(([k, , v]) => [
              String(k),
              String(Math.round(Number(v))),
            ]),
          ),
        );
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
        name: materials[r.mat].name,
        unit: "m²",
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
        <span className="visual-object-name">
          {f?.name ||
            r?.name ||
            (w ? "墙体" : o?.kind === "door" ? "门" : "窗")}
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
                    ? `${f.w} × ${f.d}`
                    : w
                      ? `${Math.round(length(w))} mm`
                      : `${o?.width} mm`}
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
                  原始建筑结构已锁定，不能修改尺寸。
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (Object.values(draft).some((v) => v.trim() === "")) {
                      setError("尺寸不能为空");
                      return;
                    }
                    try {
                      p.change((d) =>
                        editSelection(
                          d,
                          p.selection,
                          Object.fromEntries(
                            Object.entries(draft).map(([k, v]) => [
                              k,
                              Number(v),
                            ]),
                          ),
                        ),
                      );
                      setOpen(null);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "尺寸无效");
                    }
                  }}
                >
                  <div className="visual-size-fields">
                    {fields.map(([key, label]) => (
                      <label key={String(key)}>
                        {label}
                        <input
                          type="number"
                          value={draft[String(key)] ?? ""}
                          onChange={(e) =>
                            setDraft((v) => ({
                              ...v,
                              [String(key)]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="visual-form-actions">
                    <button type="button" onClick={() => setOpen(null)}>
                      取消
                    </button>
                    <button type="submit">应用尺寸</button>
                  </div>
                </form>
              )}
            </PopoverContent>
          </Popover>
        )}
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
              <label>
                地面
                <select
                  value={r.mat}
                  onChange={(e) =>
                    p.change((d) => ({
                      ...d,
                      rooms: d.rooms.map((g) =>
                        g.id === r.id ? { ...g, mat: e.target.value } : g,
                      ),
                    }))
                  }
                >
                  {Object.entries(materials).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                墙面
                <select
                  value={r.wallMat || "paint"}
                  onChange={(e) =>
                    p.change((d) => ({
                      ...d,
                      rooms: d.rooms.map((g) =>
                        g.id === r.id ? { ...g, wallMat: e.target.value } : g,
                      ),
                    }))
                  }
                >
                  {Object.entries(wallMaterials).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </PopoverContent>
          </Popover>
        )}
        {price && (
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
                  priceOf(p.design, price.group, price.key)
                }
                value={priceOf(p.design, price.group, price.key)}
                onApply={(v) => {
                  try {
                    p.change((d) => setPrice(d, price!.group, price!.key, v));
                  } catch {
                    toast.error("价格无效");
                  }
                }}
              />
              <button className="visual-cost-link" onClick={p.costs}>
                查看软装 / 硬装成本
              </button>
            </PopoverContent>
          </Popover>
        )}
        {f && (
          <>
            <button aria-label="旋转 90°" onClick={p.rotate}>
              <RotateCw size={15} />
            </button>
            <button aria-label="复制对象" onClick={p.duplicate}>
              <Copy size={15} />
            </button>
          </>
        )}
        {(f || o || editableWall) && (
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
