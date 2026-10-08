import { useState, type ReactNode } from "react";
import {
  Search,
  Armchair,
  BedDouble,
  UtensilsCrossed,
  Bath,
  Monitor,
  BookOpen,
  Plus,
  DoorOpen,
  ScanLine,
  SquareDashed,
  BrickWall,
} from "lucide-react";
import { categories, library } from "../data/catalog";
import { formatMeters } from '../model/lengthUnits';
import { FurnitureShape } from "./FurnitureShape";
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import type { LibraryItem, Tool } from "../model/types";
const libraryCategories = [...categories, '硬装'];
const categoryIcons: Record<string, typeof Armchair> = { 卧室: BedDouble, 客厅: Armchair, 餐厨: UtensilsCrossed, 卫浴: Bath, 家电: Monitor, 书房: BookOpen, 硬装: BrickWall };
export function Library({
  add,
  setTool,
  blank,
  customItems = [],
  onNew,
  rooms,
}: {
  add: (i: LibraryItem) => void;
  setTool: (t: Tool) => void;
  blank: boolean;
  customItems?: LibraryItem[];
  onNew?: () => void;
  /** 顶部的房间快捷切换列表。 */
  rooms?: ReactNode;
}) {
  const [category, setCategory] = useState("客厅"),
    [query, setQuery] = useState("");
  const items = [...customItems, ...library].filter((i) =>
    query ? i.name.includes(query) : (i.type === 'stairs' ? '硬装' : i.category) === category,
  );
  return (
    <>
      {rooms}
      <div className="panel-heading">
        <span>构件与家具</span>
        <EditorTooltip label="素材库">
          <span className="mini-label">素材库</span>
        </EditorTooltip>
      </div>
      {onNew && <EditorTooltip label="新建家具 / 账号库">
        <button className="new-furniture-button" onClick={onNew}>
          <Plus size={15} />
          新建家具 / 账号库
        </button>
      </EditorTooltip>}
      <div className="library-search">
        <Search size={15} />
        <input
          aria-label="搜索家具"
          placeholder="搜索家具、家电、硬装…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="library-categories">
        {libraryCategories.map((c) => {
          const Icon = categoryIcons[c];
          return (
            <EditorTooltip key={c} label={c}>
              <button
                className={c === category && !query ? "active" : ""}
                onClick={() => {
                  setCategory(c);
                  setQuery("");
                }}
              >
                <Icon size={16} />
                {c}
              </button>
            </EditorTooltip>
          );
        })}
      </div>
      {blank && (category === '硬装' || !!query && ['墙体', '门', '窗'].some(name => name.includes(query))) && (
        <div className="structural-items">
          <EditorTooltip label="墙体">
            <button onClick={() => setTool("wall")}>
              <SquareDashed size={18} />
              墙体
            </button>
          </EditorTooltip>
          <EditorTooltip label="门">
            <button onClick={() => setTool("door")}>
              <DoorOpen size={18} />门
            </button>
          </EditorTooltip>
          <EditorTooltip label="窗">
            <button onClick={() => setTool("window")}>
              <ScanLine size={18} />窗
            </button>
          </EditorTooltip>
        </div>
      )}
      <div className="library-tip">
        <Plus size={14} />
        <p>
          点击添加，或拖入画布。
          <br />
          所有家具均按真实尺寸绘制。
        </p>
      </div>
      <div className="library-subheading">
        {query ? "搜索结果" : category === '硬装' ? '硬装构件' : category + "家具"}
        <span>{items.length} 件</span>
      </div>
      <div className="library-grid">
        {items.map((it, i) => (
          <EditorTooltip
            key={it.name + i}
            label={it.name}
          >
            <button
              className="library-item"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/interior-item",
                  JSON.stringify(it),
                )
              }
              onClick={() => add(it)}
              aria-label={"添加" + it.name}
            >
              <span className="library-visual">
                {it.imageUrl ? (
                  <img src={it.imageUrl} crossOrigin="anonymous" alt={it.name} />
                ) : (
                  <svg
                    viewBox={`${-it.w / 2 - 100} ${-it.d / 2 - 100} ${it.w + 200} ${it.d + 200}`}
                  >
                    <FurnitureShape f={it} />
                  </svg>
                )}
              </span>
              <b>{it.name}</b>
              <small>
                {formatMeters(it.w)} × {formatMeters(it.d)} m
              </small>
            </button>
          </EditorTooltip>
        ))}
      </div>
      {!items.length && (
        <div className="empty-small">没有找到家具，试试其他关键词。</div>
      )}
    </>
  );
}
