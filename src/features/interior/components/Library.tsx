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
import { CmsFilterBar } from './CmsFilterBar';
import { ProjectLoadMore } from './ProjectLoadMore';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import type { LibraryItem, Tool } from "../model/types";
import { wallTools } from './wallTools';
/** 默认分类：展示全部家具。 */
export const LIBRARY_ALL = '全部';
/** 滚动分页：首屏 12 件，滚到底再加 12 件（12 → 24 → 36 …）。 */
export const LIBRARY_PAGE_SIZE = 12;
const libraryCategories = [LIBRARY_ALL, ...categories, '硬装'];
const categoryChips = libraryCategories.map(c => ({ id: c, label: c }));
/** 「硬装」里的构件按钮：墙（墙 / 垭口 / 房间分隔线）与门窗（门 / 窗），可按名称搜索。 */
const structuralGroups: { title: string; items: { tool: Tool; label: string; icon: LucideIcon; hint?: string }[] }[] = [
  { title: '墙', items: wallTools },
  { title: '门窗', items: [{ tool: 'door', label: '门', icon: DoorOpen }, { tool: 'window', label: '窗', icon: ScanLine }] },
];
const categoryOf = (i: LibraryItem) => i.type === 'stairs' ? '硬装' : i.category;
/**
 * 家具库侧栏：头部（搜索 + 新建、分类胶囊、分组小标题）固定，
 * 只有下面的家具列表滚动；列表按 12 件一页滚动加载。
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
    [query, setQuery] = useState(""),
    [shown, setShown] = useState(LIBRARY_PAGE_SIZE);
  const items = [...customItems, ...builtinItems].filter((i) =>
    query ? i.name.includes(query) : category === LIBRARY_ALL || categoryOf(i) === category,
  );
  const page = items.slice(0, shown);
  const search = (next: string) => { setQuery(next); setShown(LIBRARY_PAGE_SIZE); };
  const pick = (next: string) => { setCategory(next); setQuery(""); setShown(LIBRARY_PAGE_SIZE); };
  const heading = query ? "搜索结果" : category === LIBRARY_ALL ? '全部家具' : category === '硬装' ? '硬装构件' : category + "家具";
  return (
    <div className="library-panel">
      <div className="library-head">
        <div className="library-toolbar">
          <div className="library-search">
            <Search size={15} />
            <input
              aria-label="搜索家具"
              placeholder="搜索家具、家电、硬装…"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </div>
          {onNew && <EditorTooltip label="新建家具 / 账号库">
            <button type="button" className="library-new" aria-label="新建家具 / 账号库" onClick={onNew}>
              <Plus size={16} />
            </button>
          </EditorTooltip>}
        </div>
        <CmsFilterBar className="library-categories" label="家具分类" chips={categoryChips} value={query ? '' : category} onChange={pick} />
        <div className="library-subheading">
          <span>
            {heading}
            <small> · {items.length} 件</small>
          </span>
          <small>点击添加或拖入</small>
        </div>
      </div>
      {/* 切换分类或搜索时重新挂载，列表回到顶部 */}
      <div className="library-scroll" key={query ? 'q:' + query : category}>
        {structureTools && <StructuralItems query={query} show={category === '硬装' || !!query} tool={tool} setTool={setTool} />}
        <div className="library-grid">
          {page.map((it, i) => (
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
        {items.length > LIBRARY_PAGE_SIZE && (
          <ProjectLoadMore shown={page.length} total={items.length} hasMore={false} loading={false} onReach={() => setShown(shown + LIBRARY_PAGE_SIZE)} />
        )}
        {!items.length && (
          <div className="empty-small">没有找到家具，试试其他关键词。</div>
        )}
      </div>
    </div>
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
