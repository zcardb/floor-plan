import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { CmsPageHeader } from '@/components/cms/cms-page-header';
import { ManagementLoading } from '@/components/cms/management-loading';
import { CmsSearchField } from '@/components/cms/cms-search-field';
import { LoadError } from '@/components/cms/load-error';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { errorMessage, notify } from '@/lib/notify';
import { countBy } from '@/lib/paging';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { categories } from '@/lib/floor-plan/catalog';
import { formatMeters } from '@/lib/floor-plan/length-units';
import { priceOf } from '@/lib/floor-plan/costs';
import type { AccountCostSettings } from '@/lib/floor-plan/cost-defaults';
import { accountCatalog, accountCostSource, accountItemEntry, builtinCostEntries, COST_ALL, costCounts, costUnit, CUSTOM_CATEGORY, filterCostEntries, materialCostCategories, type CostEntry, type CostMajor } from '../model/account-cost-entries';
import { referenceDesign } from '@/lib/floor-plan/templates';
import { furnitureGeometryPayload } from '../model/furniture-geometry-save';
import { assetsAdjusted, builtinOf } from '@/lib/floor-plan/builtin-assets';
import { accountItemPage, readBuiltinOverrides } from '../api/library-pages';
import { accountMaterialSaves, removeAccountFurniture, saveAccountFurniture } from '../api/account-writes';
import type { Design, LibraryItem } from '@/lib/floor-plan/types';
import { CmsFilterGroup } from '@/components/cms/cms-filter-group';
import { ListLoadMore } from '@/components/list-load-more/list-load-more';
import { CostItemVisual } from './cost-item-visual';
import { AccountMaterialDialog } from './account-material-dialog';
import { AccountFurnitureDialog } from './account-furniture-dialog';
import { CustomFurnitureDialog } from './custom-furniture-dialog';
import { useAccountCostCommit } from '../hooks/use-account-cost-commit';

type Props = {
  /** 当前账号的用户 id：新建弹窗用它区分账号（换账号时丢弃未提交的草稿）。 */
  ownerKey: string;
  /** 账号默认价还在读取：价格未就绪前整片显示骨架屏。 */
  costsLoading?: boolean;
  defaults: AccountCostSettings; saveDefaults: (settings: AccountCostSettings) => Promise<boolean>; saving?: boolean; saveError?: string;
  onDirty: (dirty: boolean) => void;
};
const sizeOf = (entry: CostEntry) => entry.furniture ? ` · ${formatMeters(entry.furniture.w)} × ${formatMeters(entry.furniture.d)} m` : entry.opening ? ` · ${formatMeters(entry.opening.width)} × ${formatMeters(entry.opening.height)} m` : '';
type MajorFilter = typeof COST_ALL | CostMajor | typeof CUSTOM_CATEGORY;
/** 打开详情的那件家具：卡片上的条目，以及弹窗里正在显示（可能刚保存过）的版本。 */
type Detail = { entry: CostEntry; item: LibraryItem };

/** 内置家具在账号里的覆盖行（名称、尺寸、颜色与素材的调整），单独一次小请求读完。 */
function useBuiltinOverrides() {
  const [items, setItems] = useState<LibraryItem[]>([]), [error, setError] = useState('');
  const epoch = useRef(0);
  const reload = useCallback(async () => {
    const run = ++epoch.current;
    try {
      const next = await readBuiltinOverrides();
      if (run === epoch.current) { setItems(next); setError(''); }
    } catch (cause) {
      if (run === epoch.current) setError(errorMessage(cause, '内置家具的调整读取失败，请重试'));
    }
  }, []);
  useEffect(() => {
    const counter = epoch;
    void reload();
    return () => { counter.current++; };
  }, [reload]);
  return { items, error, reload };
}

/**
 * 账号家具库：家具与地面、墙面、门窗、屋面、吊顶统一管理，并在这里设置账号默认单价。
 * 列表统一分页（一页 20 张卡片）：账号里自建的条目由列表接口按页读取、排在前面，内置条目接在后面；
 * 硬装 / 软装 / 分类 / 搜索的筛选，自建条目在数据库里做，内置条目在本地做，分类数量两边相加。
 */
export function AccountFurnitureLibrary({ ownerKey, costsLoading = false, defaults, saveDefaults, saving = false, saveError = '', onDirty }: Props) {
  const [major, setMajor] = useState<MajorFilter>(COST_ALL), [category, setCategory] = useState(COST_ALL), [query, setQuery] = useState(''), [editing, setEditing] = useState<CostEntry | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const search = useDebouncedValue(query.trim());
  // 新建家具或材料：弹窗的默认分类跟随当前筛选；建成后列表回到第一页重新读取，新条目出现在最前面。
  const [creating, setCreating] = useState(false), [revision, setRevision] = useState(0);
  const created = () => setRevision(n => n + 1);
  const commit = useAccountCostCommit({ settings: defaults, save: saveDefaults, onDirty });
  const overrides = useBuiltinOverrides();
  const builtin = useMemo(() => builtinCostEntries(overrides.items), [overrides.items]);
  const builtinCounts = useMemo(() => costCounts(countBy(builtin, entry => entry.category), { custom: false }), [builtin]);
  const sub = major === COST_ALL || major === CUSTOM_CATEGORY ? undefined : major;
  const filter = { major: sub, category: category === COST_ALL ? undefined : category, query: search };
  const list = usePagedList<CostEntry>({
    remote: async request => {
      const page = await accountItemPage(request, filter);
      return { list: page.list.map(accountItemEntry), pagination: page.pagination, counts: costCounts(page.counts, { custom: true }) };
    },
    local: major === CUSTOM_CATEGORY ? [] : filterCostEntries(builtin, category, search, sub),
    localCounts: builtinCounts,
    key: [major, category, search, revision].join('|'),
  });
  const count = (id: string) => String(list.counts[id] ?? 0);
  /** 第一级：全部 / 硬装 / 软装 / 自定义，默认全部。 */
  const majorChips = [COST_ALL, '硬装', '软装', CUSTOM_CATEGORY].map(id => ({ id, label: id, meta: count(id) }));
  /** 第二级：只在选了硬装或软装后出现，列出该大类的细分。 */
  const subChips = sub ? [{ id: COST_ALL, label: COST_ALL, meta: count(sub) }, ...(sub === '硬装' ? materialCostCategories : categories).map(name => ({ id: name, label: name, meta: count(name) }))] : [];
  const pickMajor = (next: string) => { setMajor(next as MajorFilter); setCategory(COST_ALL); };
  const pick = (next: string) => setCategory(current => current === next ? COST_ALL : next);
  // 价格与「来源」只需要已经显示出来的自建条目。
  const design: Design = { ...referenceDesign(), ...accountCatalog(list.list), costSettings: commit.settings };
  const busy = saving || commit.busy, locked = busy || !!commit.pending;
  const failure = saveError || commit.error;
  const change = (update: (design: Design) => Design) => commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings);
  const retry = async () => { if (await commit.retry()) notify.success('账号默认价已保存并生效'); };
  const open = (entry: CostEntry) => entry.furniture ? setDetail({ entry, item: entry.furniture }) : setEditing(entry);
  // 刷新：整片切回骨架屏，按钮转圈并禁用，直到第一页重新读完。
  const refresh = () => { list.reload(); void overrides.reload(); };
  const firstLoad = costsLoading || (list.loading && !list.list.length);
  const loadError = list.error || overrides.error;
  /** 保存之后：自建条目保持已加载的页数静默重读；内置家具的调整重读覆盖行。 */
  const reread = (entry: CostEntry) => entry.account ? void list.refresh() : void overrides.reload();
  // 详情弹窗：自建家具改的是账号里那一行；内置家具改的是它在账号里的覆盖行（还没有时以内置家具为底）。
  const stored = detail?.entry.account?.kind === 'furniture' ? detail.entry.account.item : undefined;
  const builtinItem = builtinOf(detail?.item.catalogId);
  const override = builtinItem && overrides.items.find(row => row.catalogId === builtinItem.catalogId);
  return <>
    <CmsPageHeader title="账号家具库" description="家具、地面、墙面、门窗、屋面与吊顶都在这里管理，设好单价后各项目直接沿用。"
      search={<CmsSearchField label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={setQuery} loading={list.loading} loadingLabel="加载家具" matchCount={list.pagination.total}/>}
      actions={<>
        {(busy || failure || commit.saved) && <span className={'cms-sync-pill' + (failure && !busy ? ' is-error' : '')} role="status">{busy ? <><Loader2 size={13} className="animate-spin"/>正在保存…</> : failure ? <><AlertCircle size={13}/>修改尚未保存</> : <><Check size={13}/>已保存并生效</>}</span>}
        <EditorTooltip label="刷新" disabled={list.loading || locked}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={list.loading || locked} aria-busy={list.loading} onClick={refresh}><RefreshCw className={list.loading ? 'animate-spin' : ''}/></Button>
        </EditorTooltip>
        <EditorTooltip label="新建家具" disabled={locked}>
          <Button className="cms-create-button" disabled={locked} onClick={() => setCreating(true)}><Plus/>新建家具</Button>
        </EditorTooltip>
      </>}/>
    {firstLoad ? <ManagementLoading variant="library" label="加载家具与材料"/> : <>
    <div className="cms-filter-rows">
      <CmsFilterGroup ariaLabel="硬装软装" chips={majorChips} value={major} onChange={pickMajor}/>
      {!!subChips.length && <CmsFilterGroup ariaLabel={major + '分类'} chips={subChips} value={category} onChange={pick}/>}
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void retry()}>重试保存</Button>}</div>}
    {loadError && <LoadError title="家具与材料读取失败" message={loadError} retrying={list.loading} onRetry={refresh}/>}
    <div className="cms-item-grid">
      {list.list.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        const size = sizeOf(entry);
        return <EditorTooltip key={entry.group + ':' + entry.key} label={entry.name} disabled={locked}>
          <button type="button" className="cms-item-card cms-item-card--cost" aria-label={(entry.furniture ? '查看' : '编辑') + entry.name + (entry.furniture ? '' : '单价')} disabled={locked} onClick={() => open(entry)}>
            <span className="cms-item-visual"><CostItemVisual entry={entry}/><span className={'cms-item-badge' + (entry.account ? ' custom' : '')}>{entry.account && source !== '账号默认' && source !== '未定价' ? '自定义' : source}</span>{entry.adjusted && <span className="cms-item-badge adjusted">已调整</span>}</span>
            <b>{entry.name}</b>{size && <small>{size.replace(' · ', '')}</small>}
            <span className="cms-item-price">{price === null ? '未定价' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {costUnit(entry, commit.settings)}</small></span>
          </button>
        </EditorTooltip>;
      })}
    </div>
    {!list.loading && !list.error && !list.list.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的条目</h2><p>换个分类，或清空搜索再试。</p><Button variant="outline" onClick={() => { pickMajor(COST_ALL); setQuery(''); }}>清空筛选</Button></div>}
    <ListLoadMore list={list}/>
    </>}
    {editing && <AccountMaterialDialog key={editing.group + ':' + editing.key} entry={{ ...editing, unit: costUnit(editing, commit.settings) }} design={design} change={change} price={priceOf(design, editing.group, editing.key)} saves={accountMaterialSaves}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, [editing.group]: { ...current[editing.group], [editing.key]: price } }))}
      busy={busy} error={failure} retry={commit.pending ? () => void retry() : undefined} onSaved={() => reread(editing)} onClose={() => { if (!busy) setEditing(null); }}/>}
    {detail && <AccountFurnitureDialog key={detail.item.catalogId} item={{ ...detail.item, price: priceOf(design, 'furniturePrices', detail.item.catalogId!) }} isCustom={!!stored} adjusted={!!builtinItem && assetsAdjusted(builtinItem, override)} referencePrice={priceOf(design, 'furniturePrices', detail.item.catalogId!)} commitBusy={commit.busy} commitError={commit.error} retryPrice={commit.pending ? commit.retry : undefined} saved={commit.saved}
      saveGeometry={stored ? next => saveAccountFurniture(furnitureGeometryPayload(next, stored)) : undefined}
      saveAssets={builtinItem ? assets => saveAccountFurniture({ ...(override ?? builtinItem), ...assets }) : undefined}
      saveFields={builtinItem ? next => saveAccountFurniture({ ...next, price: priceOf(design, 'furniturePrices', next.catalogId!) }) : undefined}
      onOpenChange={v => { if (!v) setDetail(null); }} onChanged={next => { reread(detail.entry); setDetail(next && { ...detail, item: next }); }}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, furniturePrices: { ...current.furniturePrices, [detail.item.catalogId!]: price } }))} remove={removeAccountFurniture}/>}
    {creating && <CustomFurnitureDialog open onOpenChange={setCreating} loggedIn login={() => {}} ownerKey={ownerKey} accountOnly initialCategory={category}
      onCreate={created} onCreateFloor={created} onCreateWall={created} onCreateOpening={created} onCreateRoof={created} onCreateCeiling={created} onImport={() => {}}/>}
  </>;
}
