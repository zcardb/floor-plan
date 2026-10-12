import { useState } from "react";
import { DoorOpen, ScanLine, type LucideIcon } from "lucide-react";
import { categories, library } from "../data/catalog";
import { formatMeters } from '../model/lengthUnits';
import { FurnitureShape } from "./FurnitureShape";
import { PanelList } from './PanelList';
import { ListLoadMore } from './ListLoadMore';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { usePagedList } from '@/hooks/usePagedList';
import type { LibraryItem, Tool } from "../model/types";
import { wallTools } from './wallTools';
/** 默认分类：展示全部家具。 */
export const LIBRARY_ALL = '全部';
const libraryCategories = [LIBRARY_ALL, ...categories, '硬装'];
const categoryChips = libraryCategories.map(c => ({ id: c, label: c }));
/** 「硬装」里的构件按钮：墙（墙 / 垭口 / 房间分隔线）与门窗（门 / 窗），可按名称搜索。 */
const structuralGroups: { title: string; items: { tool: Tool; label: string; icon: LucideIcon; hint?: string }[] }[] = [
  { title: '墙', items: wallTools },
  { title: '门窗', items: [{ tool: 'door', label: '门', icon: DoorOpen }, { tool: 'window', label: '窗', icon: ScanLine }] },
];
const categoryOf = (i: LibraryItem) => i.type === 'stairs' ? '硬装' : i.category;
/**
 * 家具库侧栏：版式用 `PanelList`（头部固定，只有家具列表滚动）；
 * 家具都在内存里（内置 + 项目目录 + 账号家具），按统一分页一页 20 件滚动显示。
 */
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
  const [category, setCategory] = useState(LIBRARY_ALL),
    [query, setQuery] = useState("");
  const items = [...customItems, ...builtinItems].filter((i) =>
    query ? i.name.includes(query) : category === LIBRARY_ALL || categoryOf(i) === category,
  );
  const listKey = query ? 'q:' + query : category;
  const paged = usePagedList({ remote: null, local: items, key: listKey });
  const pick = (next: string) => { setCategory(next); setQuery(""); };
  const heading = query ? "搜索结果" : category === LIBRARY_ALL ? '全部家具' : category === '硬装' ? '硬装构件' : category + "家具";
  return (
    <PanelList
      search={{ label: "搜索家具", placeholder: "搜索家具、家电、硬装…", value: query, onChange: setQuery }}
      action={onNew && { label: "新建家具 / 账号库", onClick: onNew }}
      chips={{ label: "家具分类", items: categoryChips, value: query ? '' : category, onChange: pick }}
      title={heading}
      count={`${items.length} 件`}
      hint="点击添加或拖入"
      listKey={listKey}
    >
      {structureTools && <StructuralItems query={query} show={category === '硬装' || !!query} tool={tool} setTool={setTool} />}
      <div className="library-grid">
        {paged.list.map((it, i) => (
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
      <ListLoadMore list={paged} />
      {!items.length && (
        <div className="empty-small">没有找到家具，试试其他关键词。</div>
      )}
    </PanelList>
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
