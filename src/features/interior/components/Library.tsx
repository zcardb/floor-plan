import { useState } from "react";
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
} from "lucide-react";
import { categories, library } from "../data/catalog";
import { FurnitureShape } from "./FurnitureShape";
import type { LibraryItem, Tool } from "../model/types";
const icons = [BedDouble, Armchair, UtensilsCrossed, Bath, Monitor, BookOpen];
export function Library({
  add,
  setTool,
  blank,
  customItems = [],
  onNew,
}: {
  add: (i: LibraryItem) => void;
  setTool: (t: Tool) => void;
  blank: boolean;
  customItems?: LibraryItem[];
  onNew: () => void;
}) {
  const [category, setCategory] = useState("客厅"),
    [query, setQuery] = useState("");
  const items = [...customItems, ...library].filter((i) =>
    query ? i.name.includes(query) : i.category === category,
  );
  return (
    <>
      <div className="panel-heading">
        <span>构件与家具</span>
        <span className="mini-label">素材库</span>
      </div>
      <button className="new-furniture-button" onClick={onNew}>
        <Plus size={15} />
        新建家具 / 账号库
      </button>
      <div className="library-search">
        <Search size={15} />
        <input
          aria-label="搜索家具"
          placeholder="搜索家具、家电…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="library-categories">
        {categories.map((c, i) => {
          const Icon = icons[i];
          return (
            <button
              key={c}
              className={c === category && !query ? "active" : ""}
              onClick={() => {
                setCategory(c);
                setQuery("");
              }}
            >
              <Icon size={16} />
              {c}
            </button>
          );
        })}
      </div>
      {blank && (
        <div className="structural-items">
          <button onClick={() => setTool("wall")}>
            <SquareDashed size={18} />
            墙体
          </button>
          <button onClick={() => setTool("door")}>
            <DoorOpen size={18} />门
          </button>
          <button onClick={() => setTool("window")}>
            <ScanLine size={18} />窗
          </button>
        </div>
      )}
      <div className="library-subheading">
        {query ? "搜索结果" : category + "家具"}
        <span>{items.length} 件</span>
      </div>
      <div className="library-grid">
        {items.map((it, i) => (
          <button
            key={it.name + i}
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
              <span className="item-add">
                <Plus size={12} />
              </span>
            </span>
            <b>{it.name}</b>
            <small>
              {it.w} × {it.d} mm
            </small>
          </button>
        ))}
      </div>
      {!items.length && (
        <div className="empty-small">没有找到家具，试试其他关键词。</div>
      )}
      <div className="library-tip">
        <Plus size={14} />
        <p>
          点击添加，或拖入画布。
          <br />
          所有家具均按真实尺寸绘制。
        </p>
      </div>
    </>
  );
}
