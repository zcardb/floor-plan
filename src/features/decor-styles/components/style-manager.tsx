import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { errorMessage, notify } from "@/lib/notify";
import { readAll } from "@/lib/paging";
import { accountStylePage, readAccountStyle, saveAccountStyle } from "../api/account-styles";
import { DECOR_STYLES, decorStyleById, isCustomStyleId, isDecorStyleId, styleSwatches, type DecorStyle } from "@/lib/floor-plan/decor-styles";
import { CmsFilterGroup } from "@/components/cms/cms-filter-group";
import { CmsPageHeader } from "@/components/cms/cms-page-header";
import { CmsSearchField } from "@/components/cms/cms-search-field";
import { ListLoadMore } from "@/components/list-load-more/list-load-more";
import { LoadError } from "@/components/cms/load-error";
import { ManagementLoading } from "@/components/cms/management-loading";
import { NewStyleDialog } from "./new-style-dialog";
import { StyleDetail } from "./style-detail";
import { STYLE_ALL, STYLE_MINE, countStyles, filterStyleGroup, styleChips, styleCounts } from "../model/style-filters";

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

/** 内置风格的分类数量（与筛选无关，算一次）。 */
const BUILTIN_COUNTS = countStyles(DECOR_STYLES, { mine: false });
/** 详情页打开的我的风格：来自点开的卡片、刚保存的版本，或直接打开地址时按 id 读到的结果。 */
type Opened = { id: string; style: DecorStyle | null; error: string };

/**
 * 管理端「风格管理」：我的风格在前、内置风格在后，连成一片卡片（统一分页，一页 20 套）。
 * 我的风格由列表接口按页读取（大类与搜索在数据库里筛），内置风格在本地筛选后接在后面。
 * 版式与项目管理、家具管理一致：页头（搜索 + 刷新 + 新建）→ 一行大类筛选 → 卡片网格 → 滚动加载。
 * 点卡片进入详情（/styles/:id），详情里能看到这套风格下每件家具的样子；
 * 「新建风格」复制一套现有风格作为起点，创建后直接进详情细调。
 */
export function StyleManager({ styleId, onOpen, onDirty }: {
  /** 地址里带的风格 id：有值时显示详情。 */
  styleId?: string;
  /** 打开某套风格的详情；传 null 回到列表。 */
  onOpen: (id: string | null) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(STYLE_ALL);
  const search = useDebouncedValue(query.trim());
  const filter = { query: search, category };
  // 列表留在这一层：从详情回来时已加载的几页还在，不用重读。
  const list = usePagedList<DecorStyle>({
    remote: async (request) => {
      const page = await accountStylePage(request, { query: search, category: search || category === STYLE_ALL || category === STYLE_MINE ? undefined : category });
      return { ...page, counts: styleCounts(page.counts, { mine: true }) };
    },
    local: filterStyleGroup(DECOR_STYLES, filter, { mine: false }),
    localCounts: BUILTIN_COUNTS,
    key: search ? "q:" + search : category,
  });
  const refreshList = list.refresh;

  const [opened, setOpened] = useState<Opened | null>(null);
  const open = (style: DecorStyle) => { if (isCustomStyleId(style.id)) setOpened({ id: style.id, style, error: "" }); onOpen(style.id); };
  // 直接打开 /styles/:id（刷新页面、从地址栏进入）：我的风格按 id 读一次。
  const unread = styleId && isCustomStyleId(styleId) && opened?.id !== styleId ? styleId : undefined;
  useEffect(() => {
    if (!unread) return;
    let alive = true;
    readAccountStyle(unread).then(
      (style) => { if (alive) setOpened({ id: unread, style, error: "" }); },
      (cause) => { if (alive) setOpened({ id: unread, style: null, error: errorMessage(cause, "风格读取失败，请重试") }); },
    );
    return () => { alive = false; };
  }, [unread]);

  /** 新建弹窗；起点下拉要列出全部我的风格，打开前一次读完（选择器不分页）。 */
  const [creating, setCreating] = useState<{ base: string; styles: DecorStyle[] } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const startCreate = async (base: string) => {
    setPreparing(true);
    try {
      setCreating({ base, styles: [...await readAll(accountStylePage), ...DECOR_STYLES] });
    } catch (cause) {
      notify.error("我的风格读取失败，这次只能从内置风格开始", cause);
      setCreating({ base, styles: DECOR_STYLES });
    } finally {
      setPreparing(false);
    }
  };
  const create = useCallback(async (style: DecorStyle) => {
    await saveAccountStyle(style);
    notify.success(`已新建「${style.name}」`);
    setOpened({ id: style.id, style, error: "" });
    onOpen(style.id);
    void refreshList();
  }, [onOpen, refreshList]);
  const dialog = creating && (
    <NewStyleDialog open onOpenChange={(next) => { if (!next) setCreating(null); }} styles={creating.styles} initialBase={creating.base || undefined} onCreate={create} />
  );

  if (styleId) {
    const style = isDecorStyleId(styleId) ? decorStyleById(styleId) : opened?.id === styleId ? opened.style : null;
    if (!style) {
      const failed = opened?.id === styleId ? opened.error : "";
      return (
        <div className="style-detail-missing" role={failed ? "alert" : undefined}>
          <p>{unread ? "正在读取风格…" : failed ? `风格读取失败：${failed}` : "这套风格不存在，可能已经被删除。"}</p>
          {failed && <Button variant="outline" onClick={() => setOpened(null)}>重试</Button>}
          <Button variant="outline" onClick={() => onOpen(null)}>回到风格管理</Button>
        </div>
      );
    }
    return <>
      <StyleDetail key={style.id} style={style} custom={isCustomStyleId(style.id)}
        onBack={() => onOpen(null)} onDuplicate={() => void startCreate(style.id)} duplicating={preparing}
        onSaved={(saved) => { setOpened({ id: saved.id, style: saved, error: "" }); void refreshList(); }}
        onDeleted={() => { void refreshList(); onOpen(null); }} onDirty={onDirty} />
      {dialog}
    </>;
  }
  const resetFilter = () => { setCategory(STYLE_ALL); setQuery(""); };
  const firstLoad = list.loading && !list.list.length;
  return <>
    <CmsPageHeader
      title="风格管理"
      description="一键切换 3D 场景的整体配色，平面图与造价不受影响。"
      search={<CmsSearchField label="搜索风格" placeholder="搜索风格名称、材质或大类" value={query} onChange={setQuery} loading={list.loading} loadingLabel="加载风格" matchCount={list.pagination.total} />}
      actions={<>
        <EditorTooltip label="刷新" disabled={list.loading}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={list.loading} aria-busy={list.loading} onClick={list.reload}><RefreshCw className={list.loading ? "animate-spin" : ""} /></Button>
        </EditorTooltip>
        <Button className="cms-create-button" disabled={preparing} aria-busy={preparing} onClick={() => void startCreate("")}>{preparing ? <Loader2 className="animate-spin" /> : <Plus />}新建风格</Button>
      </>}
    />
    {firstLoad ? <ManagementLoading variant="library" label="加载风格" /> : <>
      <div className="cms-filter-rows">
        <CmsFilterGroup ariaLabel="风格大类" chips={styleChips(list.counts)} value={search ? "" : category} onChange={(id) => { setCategory(id); setQuery(""); }} />
      </div>
      {list.error && <LoadError title="我的风格读取失败" message={list.error} retrying={list.loading} onRetry={list.reload} />}
      <div className="cms-item-grid">
        {list.list.map((style) => <StyleCard key={style.id} style={style} onOpen={() => open(style)} />)}
      </div>
      {!list.loading && !list.list.length && <div className="cms-empty"><Search size={30} /><h2>没有匹配的风格</h2><p>换个大类，或清空搜索再试。</p><Button variant="outline" onClick={resetFilter}>清空筛选</Button></div>}
      <ListLoadMore list={list} />
    </>}
    {dialog}
  </>;
}
