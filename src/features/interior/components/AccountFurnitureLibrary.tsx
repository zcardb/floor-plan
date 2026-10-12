import { useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { CmsPageHeader } from './CmsPageHeader';
import { ManagementLoading } from './ManagementLoading';
import { CmsSearchField } from './CmsSearchField';
import { LoadError } from './LoadError';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { notify } from '@/lib/notify';
import { categories } from '../data/catalog';
import { formatMeters } from '../model/lengthUnits';
import { priceOf } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { accountCostEntries, accountCostSource, costCategories, CUSTOM_CATEGORY, filterCostEntries, materialCostCategories, type CostEntry, type CostMajor } from '../model/accountCostEntries';
import { referenceDesign } from '../data/templates';
import { furnitureGeometryPayload } from '../model/furnitureGeometrySave';
import { assetsAdjusted, builtinOf, withBuiltinAssets } from '../model/builtinAssets';
import type { AccountLibrary } from '../cloud/useAccountLibrary';
import { accountMaterialSaves, removeAccountFurniture, saveAccountFurniture } from '../cloud/accountWrites';
import type { Design, LibraryItem } from '../model/types';
import { CmsFilterGroup } from './CmsFilterGroup';
import { ProjectLoadMore } from './ProjectLoadMore';
import { CostItemVisual } from './CostItemVisual';
import { AccountMaterialDialog } from './AccountMaterialDialog';
import { AccountFurnitureDialog } from './AccountFurnitureDialog';
import { useAccountCostCommit } from './useAccountCostCommit';

type Props = {
  /** 账号库（数据库合并视图一次读完）：家具、内置家具覆盖与各类材料，以及刷新。 */
  library: Pick<AccountLibrary, 'furniture' | 'overrides' | 'floors' | 'walls' | 'openings' | 'roofs' | 'ceilings' | 'loading' | 'error' | 'load'>;
  defaults: AccountCostSettings; saveDefaults: (settings: AccountCostSettings) => Promise<boolean>; saving?: boolean; saveError?: string;
  onDirty: (dirty: boolean) => void; onNew: (category: string) => void;
};
const sizeOf = (entry: CostEntry) => entry.furniture ? ` · ${formatMeters(entry.furniture.w)} × ${formatMeters(entry.furniture.d)} m` : entry.opening ? ` · ${formatMeters(entry.opening.width)} × ${formatMeters(entry.opening.height)} m` : '';
/** 每页 12 个：进来先显示一页，滚到底部再显示下一页（数据已一次读完，翻页不再请求）。 */
const PAGE_SIZE = 12;
const ALL = '全部';
type MajorFilter = typeof ALL | CostMajor | typeof CUSTOM_CATEGORY;

/** 账号家具库：家具与地面、墙面、门窗、屋面、吊顶统一管理，并在这里设置账号默认单价。 */
export function AccountFurnitureLibrary({ library, defaults, saveDefaults, saving = false, saveError = '', onDirty, onNew }: Props) {
  const { furniture, overrides, floors, walls, openings, roofs, ceilings } = library;
  const [major, setMajor] = useState<MajorFilter>(ALL), [category, setCategory] = useState(ALL), [query, setQuery] = useState(''), [shown, setShown] = useState(PAGE_SIZE), [editing, setEditing] = useState<CostEntry | null>(null), [detail, setDetail] = useState<LibraryItem | null>(null);
  const commit = useAccountCostCommit({ settings: defaults, save: saveDefaults, onDirty });
  const design: Design = { ...referenceDesign(), customCatalog: furniture, customFloors: floors, customWalls: walls, customOpenings: openings, customRoofs: roofs, customCeilings: ceilings, costSettings: commit.settings };
  /** 内置家具的覆盖行（账号库里与内置同 catalogId 的那一行）：名称、尺寸、颜色与素材。 */
  const overrideById = new Map(overrides.map(item => [item.catalogId, item]));
  // 内置家具套用账号里的覆盖：卡片名称、尺寸、缩略图与详情预览都用调整后的值。
  const entries = accountCostEntries(furniture, commit.settings, floors, walls, openings, { roofs, ceilings }).map(entry => {
    const builtin = builtinOf(entry.furniture?.catalogId);
    if (!builtin) return entry;
    const furniture = withBuiltinAssets(builtin, overrideById.get(builtin.catalogId));
    return { ...entry, name: furniture.name, furniture };
  });
  const adjustedOf = (catalogId: string | undefined) => {
    const builtin = builtinOf(catalogId);
    return !!builtin && assetsAdjusted(builtin, overrideById.get(catalogId));
  };
  const visible = major === CUSTOM_CATEGORY ? filterCostEntries(entries, CUSTOM_CATEGORY, query) : filterCostEntries(entries, category, query, major === ALL ? undefined : major);
  // 按分类顺序排成一整片（硬装地面…楼梯，再软装卧室…），不加分类小标题；分类之外的条目排在最后。
  const ordered = [...costCategories.flatMap(name => visible.filter(entry => entry.category === name)), ...visible.filter(entry => !costCategories.includes(entry.category))];
  const page = ordered.slice(0, shown);
  const loadMore = () => setShown(shown + PAGE_SIZE);
  /** 第一级：全部 / 硬装 / 软装 / 自定义，默认全部。 */
  const majorChips = [ALL, '硬装', '软装', CUSTOM_CATEGORY].map(id => ({ id, label: id, meta: String(id === ALL ? entries.length : id === CUSTOM_CATEGORY ? entries.filter(entry => entry.custom).length : entries.filter(entry => entry.major === id).length) }));
  /** 第二级：只在选了硬装或软装后出现，列出该大类的细分。 */
  const countOf = (name: string) => entries.filter(entry => entry.major === major && entry.category === name).length;
  const subChips = major === ALL || major === CUSTOM_CATEGORY ? [] : [{ id: ALL, label: ALL, meta: String(entries.filter(entry => entry.major === major).length) },
    ...(major === '硬装' ? materialCostCategories : categories).map(name => ({ id: name, label: name, meta: String(countOf(name)) }))];
  const pickMajor = (next: string) => { setMajor(next as MajorFilter); setCategory(ALL); setShown(PAGE_SIZE); };
  const pick = (next: string) => { setCategory(current => current === next ? ALL : next); setShown(PAGE_SIZE); };
  const search = (next: string) => { setQuery(next); setShown(PAGE_SIZE); };
  const busy = saving || commit.busy, locked = busy || !!commit.pending;
  const failure = saveError || commit.error;
  const change = (update: (design: Design) => Design) => commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings);
  const retry = async () => { if (await commit.retry()) notify.success('账号默认价已保存并生效'); };
  const open = (entry: CostEntry) => entry.furniture ? setDetail(entry.furniture) : setEditing(entry);
  const customIds = new Set(furniture.map(item => item.catalogId));
  // 刷新与项目管理页同一套逻辑：整页切回骨架屏，按钮转圈并禁用，直到所有账号库重新读完。
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    setShown(PAGE_SIZE);
    try { await library.load(); } finally { setRefreshing(false); }
  };
  const loadingList = refreshing || library.loading;
  /** 内置家具的覆盖保存后重读账号库，卡片和详情立即用上新素材。 */
  const saveOverride = async (item: LibraryItem) => { const ok = await saveAccountFurniture(item); if (ok) void library.load(); return ok; };
  return <>
    <CmsPageHeader title="账号家具库" description="家具、地面、墙面、门窗、屋面与吊顶都在这里管理，设好单价后各项目直接沿用。"
      search={<CmsSearchField label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={search} loading={library.loading} loadingLabel="加载家具" matchCount={visible.length}/>}
      actions={<>
        {(busy || failure || commit.saved) && <span className={'cms-sync-pill' + (failure && !busy ? ' is-error' : '')} role="status">{busy ? <><Loader2 size={13} className="animate-spin"/>正在保存…</> : failure ? <><AlertCircle size={13}/>修改尚未保存</> : <><Check size={13}/>已保存并生效</>}</span>}
        <EditorTooltip label="刷新" disabled={loadingList || locked}>
          <Button variant="outline" className="cms-refresh-button cms-icon-button" aria-label="刷新" disabled={loadingList || locked} aria-busy={loadingList} onClick={() => void refresh()}><RefreshCw className={loadingList ? 'animate-spin' : ''}/></Button>
        </EditorTooltip>
        <EditorTooltip label="新建家具" disabled={locked}>
          <Button className="cms-create-button" disabled={locked} onClick={() => onNew(category)}><Plus/>新建家具</Button>
        </EditorTooltip>
      </>}/>
    {refreshing ? <ManagementLoading variant="library" label="刷新家具与材料"/> : <>
    <div className="cms-filter-rows">
      <CmsFilterGroup ariaLabel="硬装软装" chips={majorChips} value={major} onChange={pickMajor}/>
      {!!subChips.length && <CmsFilterGroup ariaLabel={major + '分类'} chips={subChips} value={category} onChange={pick}/>}
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void retry()}>重试保存</Button>}</div>}
    {library.error && <LoadError title="家具与材料读取失败" message={library.error} retrying={library.loading} onRetry={() => void refresh()}/>}
    <div className="cms-item-grid">
      {page.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        const size = sizeOf(entry);
        return <EditorTooltip key={entry.group + ':' + entry.key} label={entry.name} disabled={locked}>
          <button type="button" className="cms-item-card cms-item-card--cost" aria-label={(entry.furniture ? '查看' : '编辑') + entry.name + (entry.furniture ? '' : '单价')} disabled={locked} onClick={() => open(entry)}>
            <span className="cms-item-visual"><CostItemVisual entry={entry}/><span className={'cms-item-badge' + (entry.custom ? ' custom' : '')}>{entry.custom && source !== '账号默认' && source !== '未定价' ? '自定义' : source}</span>{adjustedOf(entry.furniture?.catalogId) && <span className="cms-item-badge adjusted">已调整</span>}</span>
            <b>{entry.name}</b>{size && <small>{size.replace(' · ', '')}</small>}
            <span className="cms-item-price">{price === null ? '未定价' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {entry.unit}</small></span>
          </button>
        </EditorTooltip>;
      })}
    </div>
    {!library.loading && !visible.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的条目</h2><p>换个分类，或清空搜索再试。</p><Button variant="outline" onClick={() => { pickMajor(ALL); search(''); }}>清空筛选</Button></div>}
    {!!visible.length && <ProjectLoadMore shown={page.length} total={ordered.length} hasMore={false} loading={false} onReach={loadMore}/>}
    </>}
    {editing && <AccountMaterialDialog key={editing.group + ':' + editing.key} entry={{ ...editing, unit: entries.find(entry => entry.key === editing.key && entry.group === editing.group)?.unit || editing.unit }} design={design} change={change} price={priceOf(design, editing.group, editing.key)} saves={accountMaterialSaves}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, [editing.group]: { ...current[editing.group], [editing.key]: price } }))}
      busy={busy} error={failure} retry={commit.pending ? () => void retry() : undefined} onSaved={() => void library.load()} onClose={() => { if (!busy) setEditing(null); }}/>}
    {detail && <AccountFurnitureDialog key={detail.catalogId} item={{ ...detail, price: priceOf(design, 'furniturePrices', detail.catalogId!) }} isCustom={customIds.has(detail.catalogId!)} adjusted={adjustedOf(detail.catalogId)} referencePrice={priceOf(design, 'furniturePrices', detail.catalogId!)} commitBusy={commit.busy} commitError={commit.error} retryPrice={commit.pending ? commit.retry : undefined} saved={commit.saved}
      saveGeometry={customIds.has(detail.catalogId!) ? next => { const stored = furniture.find(item => item.catalogId === next.catalogId); if (!stored) return Promise.reject(new Error('家具数据尚未就绪，请重新加载后重试')); return saveAccountFurniture(furnitureGeometryPayload(next, stored)); } : undefined}
      saveAssets={builtinOf(detail.catalogId) ? assets => saveOverride({ ...(overrides.find(row => row.catalogId === detail.catalogId) ?? builtinOf(detail.catalogId)!), ...assets }) : undefined}
      saveFields={builtinOf(detail.catalogId) ? next => saveOverride({ ...next, price: priceOf(design, 'furniturePrices', next.catalogId!) }) : undefined}
      onOpenChange={v => { if (!v) setDetail(null); }} onChanged={next => { setDetail(next); void library.load(); }}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, furniturePrices: { ...current.furniturePrices, [detail.catalogId!]: price } }))} remove={removeAccountFurniture}/>}
  </>;
}
