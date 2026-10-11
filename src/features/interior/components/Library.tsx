import { useState } from "react";
import {
  Search,
  Plus,
  DoorOpen,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { categories, library } from "../data/catalog";
import { formatMeters } from '../model/lengthUnits';
import { FurnitureShape } from "./FurnitureShape";
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import type { LibraryItem, Tool } from "../model/types";
import { wallTools } from './wallTools';
const libraryCategories = [...categories, '硬装'];
/** 「硬装」里的构件按钮：墙（墙 / 垭口 / 房间分隔线）与门窗（门 / 窗），可按名称搜索。 */
const structuralGroups: { title: string; items: { tool: Tool; label: string; icon: LucideIcon; hint?: string }[] }[] = [
  { title: '墙', items: wallTools },
  { title: '门窗', items: [{ tool: 'door', label: '门', icon: DoorOpen }, { tool: 'window', label: '窗', icon: ScanLine }] },
];
export function Library({
  add,
  tool,
  setTool,
  structureTools,
  customItems = [],
  builtinItems = library,
  onNew,
  readOnly = false,
}: {
  readOnly?: boolean;
  add: (i: LibraryItem) => void;
  /** 当前工具，用于高亮对应的构件按钮。 */
  tool?: Tool;
  setTool: (t: Tool) => void;
  structureTools: boolean;
  customItems?: LibraryItem[];
  /** 内置素材库（已套用账号里的 2D / 3D 素材覆盖）；默认是原始内置库。 */
  builtinItems?: LibraryItem[];
  onNew?: () => void;
}) {
  const [category, setCategory] = useState("客厅"),
    [query, setQuery] = useState("");
  const items = [...customItems, ...builtinItems].filter((i) =>
    query ? i.name.includes(query) : (i.type === 'stairs' ? '硬装' : i.category) === category,
  );
  return (
    <>
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={15} />
          <input
            aria-label="搜索家具"
            placeholder="搜索家具、家电、硬装…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {onNew && <EditorTooltip label="新建家具 / 账号库">
          <button type="button" className="library-new" aria-label="新建家具 / 账号库" onClick={onNew}>
            <Plus size={16} />
          </button>
        </EditorTooltip>}
      </div>
      <div className="library-categories" role="group" aria-label="家具分类">
        {libraryCategories.map((c) => (
          <button
            key={c}
            type="button"
            className={c === category && !query ? "active" : ""}
            aria-pressed={c === category && !query}
            onClick={() => {
              setCategory(c);
              setQuery("");
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {structureTools && <StructuralItems query={query} show={category === '硬装' || !!query} tool={tool} setTool={setTool} />}
      <div className="library-subheading">
        <span>
          {query ? "搜索结果" : category === '硬装' ? '硬装构件' : category + "家具"}
          <small> · {items.length} 件</small>
        </span>
        <small>点击添加或拖入</small>
      </div>
      <div className="library-grid">
        {items.map((it, i) => (
          <EditorTooltip
            key={it.name + i}
            label={it.name}
          >
            <button
              className="library-item"
              draggable={!readOnly}
              disabled={readOnly}
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

/** 「硬装」的构件按钮分组（无内部状态，可直接展开测试）。 */
export function StructuralItems({ query, show, tool, setTool }: { query: string; show: boolean; tool?: Tool; setTool: (t: Tool) => void }) {
  if (!show) return null;
  const groups = structuralGroups
    .map(g => ({ ...g, items: g.items.filter(item => !query || item.label.includes(query) || g.title.includes(query)) }))
    .filter(g => g.items.length);
  if (!groups.length) return null;
  return (
    <div className="structural-items">
      {groups.map(g => (
        <section key={g.title} className="structural-group" aria-label={g.title}>
          <h4>{g.title}</h4>
          <div>
            {g.items.map(item => (
              <EditorTooltip key={item.tool} label={item.hint ?? item.label}>
                <button className={tool === item.tool ? 'active' : ''} onClick={() => setTool(item.tool)}>
                  <item.icon size={18} />{item.label}
                </button>
              </EditorTooltip>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
