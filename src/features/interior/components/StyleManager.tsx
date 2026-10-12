import { useCallback, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { usePagedList } from "@/hooks/usePagedList";
import { notify } from "@/lib/notify";
import { saveAccountStyle } from "../cloud/accountWrites";
import type { AccountLibrary } from "../cloud/useAccountLibrary";
import { DECOR_STYLES, decorStyleById, isCustomStyleId, isDecorStyleId, styleSwatches, type DecorStyle } from "../model/decorStyles";
import { CmsFilterGroup } from "./CmsFilterGroup";
import { CmsPageHeader } from "./CmsPageHeader";
import { CmsSearchField } from "./CmsSearchField";
import { ListLoadMore } from "./ListLoadMore";
import { LoadError } from "./LoadError";
import { NewStyleDialog } from "./NewStyleDialog";
import { StyleDetail } from "./StyleDetail";
import { STYLE_ALL, filterStyles, styleChips } from "./styleFilters";

/** 风格卡片：与家具管理同一套卡片，缩略图是五段主色条；角标标明「我的」、默认或大类，点开进入详情。 */
function StyleCard({ style, onOpen }: { style: DecorStyle; onOpen: () => void }) {
  const mine = isCustomStyleId(style.id);
  const badge = mine ? "我的" : style.recommended ? "默认" : style.category;
  return (
    <button type="button" className="cms-item-card cms-style-card" aria-label={`查看风格 ${style.name}`} onClick={onOpen}>
      <span className="cms-item-visual cms-style-swatches">
        {styleSwatches(style).map((color, i) => <i key={i} style={{ background: color }} />)}
        {badge && <span className={"cms-item-badge" + (mine ? " custom" : "")}>{badge}</span>}
      </span>
      <b>{style.name}</b>
      <small>{style.summary}</small>
    </button>
  );
}

/**
 * 管理端「风格管理」：账号自建风格在前、内置风格在后，连成一片卡片（统一分页，一页 20 套）。
 * 版式与项目管理、家具管理一致：页头（搜索 + 刷新 + 新建）→ 一行大类筛选 → 卡片网格 → 滚动加载。
 * 点卡片进入详情（/styles/:id），详情里能看到这套风格下每件家具的样子；
 * 「新建风格」复制一套现有风格作为起点，创建后直接进详情细调。
 */
export function StyleManager({ library, styleId, onOpen, onDirty }: {
  library: AccountLibrary;
  /** 地址里带的风格 id：有值时显示详情。 */
  styleId?: string;
  /** 打开某套风格的详情；传 null 回到列表。 */
  onOpen: (id: string | null) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(STYLE_ALL);
  /** 新建弹窗的起点风格 id；null 表示弹窗关闭。 */
  const [creating, setCreating] = useState<string | null>(null);
  const mine = library.styles;
  const searching = query.trim() !== "";
  const shown = filterStyles(DECOR_STYLES, mine, { query, category });
  const paged = usePagedList({ remote: null, local: shown, key: searching ? "q:" + query.trim() : category });
  const create = useCallback(async (style: DecorStyle) => {
    await saveAccountStyle(style);
    await library.load();
    notify.success(`已新建「${style.name}」`);
    onOpen(style.id);
  }, [library, onOpen]);
  const dialog = creating !== null && (
    <NewStyleDialog open onOpenChange={(open) => { if (!open) setCreating(null); }} styles={[...mine, ...DECOR_STYLES]} initialBase={creating || undefined} onCreate={create} />
  );
  if (styleId) {
    const style = mine.find((s) => s.id === styleId) ?? (isDecorStyleId(styleId) ? decorStyleById(styleId) : undefined);
    if (!style) return (
      <div className="style-detail-missing">
        <p>{library.loading ? "正在读取风格…" : "这套风格不存在，可能已经被删除。"}</p>
        <Button variant="outline" onClick={() => onOpen(null)}>回到风格管理</Button>
      </div>
    );
    return <>
      <StyleDetail key={style.id} style={style} custom={isCustomStyleId(style.id)} library={library}
        onBack={() => onOpen(null)} onDuplicate={() => setCreating(style.id)} onDeleted={() => onOpen(null)} onDirty={onDirty} />
      {dialog}
    </>;
  }
  const refresh = () => { paged.reload(); void library.load(); };
  const resetFilter = () => { setCategory(STYLE_ALL); setQuery(""); };
  return <>
    <CmsPageHeader
      title="风格管理"
      description="一键切换 3D 场景的整体配色，平面图与造价不受影响。"
      search={<CmsSearchField label="搜索风格" placeholder="搜索风格名称、材质或大类" value={query} onChange={setQuery} loading={library.loading} loadingLabel="加载风格" matchCount={shown.length} />}
      actions={<>
        <EditorTooltip label="刷新" disabled={library.loading}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={library.loading} aria-busy={library.loading} onClick={refresh}><RefreshCw className={library.loading ? "animate-spin" : ""} /></Button>
        </EditorTooltip>
        <Button className="cms-create-button" onClick={() => setCreating("")}><Plus />新建风格</Button>
      </>}
    />
    <div className="cms-filter-rows">
      <CmsFilterGroup ariaLabel="风格大类" chips={styleChips(DECOR_STYLES, mine)} value={searching ? "" : category} onChange={(id) => { setCategory(id); setQuery(""); }} />
    </div>
    {library.error && <LoadError title="自定义风格读取失败" message={library.error} retrying={library.loading} onRetry={refresh} />}
    <div className="cms-item-grid">
      {paged.list.map((style) => <StyleCard key={style.id} style={style} onOpen={() => onOpen(style.id)} />)}
    </div>
    {!shown.length && <div className="cms-empty"><Search size={30} /><h2>没有匹配的风格</h2><p>换个大类，或清空搜索再试。</p><Button variant="outline" onClick={resetFilter}>清空筛选</Button></div>}
    <ListLoadMore list={paged} />
    {dialog}
  </>;
}
