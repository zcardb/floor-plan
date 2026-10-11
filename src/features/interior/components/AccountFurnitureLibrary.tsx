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
import { accountCostEntries, accountCostSource, CUSTOM_CATEGORY, filterCostEntries, materialCostCategories, type CostEntry, type CostMajor } from '../model/accountCostEntries';
import { referenceDesign } from '../data/templates';
import { furnitureGeometryPayload } from '../model/furnitureGeometrySave';
import { assetsAdjusted, builtinOf, withBuiltinAssets } from '../model/builtinAssets';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { CustomFloor, CustomOpening, CustomWall, Design, LibraryItem } from '../model/types';
import { CmsFilterGroup } from './CmsFilterGroup';
import { CmsFilterSwitch } from './CmsFilterSwitch';
import { CostItemVisual } from './CostItemVisual';
import { AccountMaterialDialog, type MaterialSaves } from './AccountMaterialDialog';
import { AccountFurnitureDialog } from './AccountFurnitureDialog';
import { useAccountCostCommit } from './useAccountCostCommit';

type Props = {
  catalog: ReturnType<typeof useFurnitureCatalog>; floors?: CustomFloor[]; walls?: CustomWall[]; openings?: CustomOpening[]; roofs?: CustomWall[]; ceilings?: CustomWall[];
  defaults: AccountCostSettings; saveDefaults: (settings: AccountCostSettings) => Promise<boolean>; saving?: boolean; saveError?: string;
  onDirty: (dirty: boolean) => void; onNew: (category: string) => void; loadError?: string;
  /** 重取家具与硬装账号库：页头刷新按钮与读取失败的「重试」共用。 */
  reload?: () => Promise<void>;
  /** 硬装账号库的保存与刷新：查看弹窗里修改自定义地面 / 墙面 / 门窗 / 屋面 / 吊顶。 */
  materialSaves?: MaterialSaves; reloadMaterial?: (kind: keyof MaterialSaves) => void;
};
const sizeOf = (entry: CostEntry) => entry.furniture ? ` · ${formatMeters(entry.furniture.w)} × ${formatMeters(entry.furniture.d)} m` : entry.opening ? ` · ${formatMeters(entry.opening.width)} × ${formatMeters(entry.opening.height)} m` : '';

/** 账号家具库：家具与地面、墙面、门窗、屋面、吊顶统一管理，并在这里设置账号默认单价。 */
export function AccountFurnitureLibrary({ catalog, floors = [], walls = [], openings = [], roofs = [], ceilings = [], defaults, saveDefaults, saving = false, saveError = '', onDirty, onNew, loadError = '', reload, materialSaves, reloadMaterial }: Props) {
  const [major, setMajor] = useState<CostMajor>('硬装'), [category, setCategory] = useState('全部'), [query, setQuery] = useState(''), [editing, setEditing] = useState<CostEntry | null>(null), [detail, setDetail] = useState<LibraryItem | null>(null);
  const commit = useAccountCostCommit({ settings: defaults, save: saveDefaults, onDirty });
  const design: Design = { ...referenceDesign(), customCatalog: catalog.items, customFloors: floors, customWalls: walls, customOpenings: openings, customRoofs: roofs, customCeilings: ceilings, costSettings: commit.settings };
  /** 内置家具的素材覆盖行（账号库里与内置同 catalogId 的那一行）。 */
  const overrideById = new Map(catalog.overrides.map(item => [item.catalogId, item]));
  // 内置家具套用账号里的素材覆盖：卡片缩略图、详情预览都用调整后的素材。
  const entries = accountCostEntries(catalog.items, commit.settings, floors, walls, openings, { roofs, ceilings }).map(entry => {
    const builtin = builtinOf(entry.furniture?.catalogId);
    return builtin ? { ...entry, furniture: withBuiltinAssets(builtin, overrideById.get(builtin.catalogId)) } : entry;
  });
  const adjustedOf = (catalogId: string | undefined) => {
    const builtin = builtinOf(catalogId);
    return !!builtin && assetsAdjusted(builtin, overrideById.get(catalogId));
  };
  const visible = filterCostEntries(entries, category, query, major);
  const names = major === '硬装' ? materialCostCategories : categories;
  /** 胶囊数量：普通分类按 category 计数，「自定义」数该大类里自建的条目。 */
  const countOf = (name: string) => entries.filter(entry => entry.major === major && (name === CUSTOM_CATEGORY ? !!entry.custom : entry.category === name)).length;
  const chips = [{ id: '全部', label: '全部', meta: String(entries.filter(entry => entry.major === major).length) },
    ...names.map(name => ({ id: name, label: name, meta: String(countOf(name)) })),
    { id: CUSTOM_CATEGORY, label: CUSTOM_CATEGORY, meta: String(countOf(CUSTOM_CATEGORY)) }];
  /** 左侧下拉的两个大类：切过去时分类回到「全部」。 */
  const majors = (['硬装', '软装'] as CostMajor[]).map(item => ({ id: item, label: item, count: entries.filter(entry => entry.major === item).length }));
  const pick = (next: string) => setCategory(current => current === next ? '全部' : next);
  const switchMajor = (next: string) => { setMajor(next as CostMajor); setCategory('全部'); };
  const busy = saving || commit.busy, locked = busy || !!commit.pending;
  const failure = saveError || commit.error;
  const change = (update: (design: Design) => Design) => commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings);
  const retry = async () => { if (await commit.retry()) notify.success('账号默认价已保存并生效'); };
  const open = (entry: CostEntry) => entry.furniture ? setDetail(entry.furniture) : setEditing(entry);
  const customIds = new Set(catalog.items.map(item => item.catalogId));
  // 刷新与项目管理页同一套逻辑：整页切回骨架屏，按钮转圈并禁用，直到所有账号库重新读完。
  const [refreshing, setRefreshing] = useState(false);
  const reloadAll = reload ?? (() => catalog.load());
  const refresh = async () => {
    setRefreshing(true);
    try { await reloadAll(); } finally { setRefreshing(false); }
  };
  const loadingList = refreshing || catalog.loading;
  return <>
    <CmsPageHeader title="账号家具库" description="家具、地面、墙面、门窗、屋面与吊顶都在这里管理，设好单价后各项目直接沿用。"
      search={<CmsSearchField label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={setQuery} loading={catalog.loading} loadingLabel="加载家具" matchCount={visible.length}/>}
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
      <CmsFilterGroup lead={<CmsFilterSwitch label="硬装软装" options={majors} value={major} onChange={switchMajor}/>} ariaLabel={major + '分类'} chips={chips} value={category} onChange={pick}/>
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void retry()}>重试保存</Button>}</div>}
    {(loadError || catalog.error) && <LoadError title="家具与材料读取失败" message={loadError || catalog.error} retrying={catalog.loading} onRetry={() => void refresh()}/>}
    <div className="cms-item-grid">
      {visible.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        const size = sizeOf(entry);
        return <EditorTooltip key={entry.group + ':' + entry.key} label={entry.name} disabled={locked}>
          <button type="button" className="cms-item-card cms-item-card--cost" aria-label={(entry.furniture ? '查看' : '编辑') + entry.name + (entry.furniture ? '' : '单价')} disabled={locked} onClick={() => open(entry)}>
            <span className="cms-item-visual"><CostItemVisual entry={entry}/><span className={'cms-item-badge' + (entry.custom ? ' custom' : '')}>{entry.custom && source !== '账号默认' && source !== '未定价' ? '自定义' : source}</span>{adjustedOf(entry.furniture?.catalogId) && <span className="cms-item-badge adjusted">素材已调整</span>}</span>
            <b>{entry.name}</b>{size && <small>{size.replace(' · ', '')}</small>}
            <span className="cms-item-price">{price === null ? '未定价' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {entry.unit}</small></span>
          </button>
        </EditorTooltip>;
      })}
    </div>
    {!catalog.loading && !visible.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的条目</h2><p>{catalog.hasMore ? '可加载更多家具，或调整分类与搜索。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={() => { setCategory('全部'); setQuery(''); }}>清空筛选</Button></div>}
    {catalog.hasMore && <div className="cms-more"><Button variant="outline" loading={catalog.loading} disabled={busy} onClick={() => void catalog.load(true)}>加载更多账号家具款式</Button></div>}
    </>}
    {editing && materialSaves && <AccountMaterialDialog key={editing.group + ':' + editing.key} entry={{ ...editing, unit: entries.find(entry => entry.key === editing.key && entry.group === editing.group)?.unit || editing.unit }} design={design} change={change} price={priceOf(design, editing.group, editing.key)} saves={materialSaves}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, [editing.group]: { ...current[editing.group], [editing.key]: price } }))}
      busy={busy} error={failure} retry={commit.pending ? () => void retry() : undefined} onSaved={kind => reloadMaterial?.(kind)} onClose={() => { if (!busy) setEditing(null); }}/>}
    {detail && <AccountFurnitureDialog key={detail.catalogId} item={{ ...detail, price: priceOf(design, 'furniturePrices', detail.catalogId!) }} isCustom={customIds.has(detail.catalogId!)} adjusted={adjustedOf(detail.catalogId)} referencePrice={priceOf(design, 'furniturePrices', detail.catalogId!)} commitBusy={commit.busy} commitError={commit.error} retryPrice={commit.pending ? commit.retry : undefined} saved={commit.saved}
      saveGeometry={customIds.has(detail.catalogId!) ? next => { const stored = catalog.items.find(item => item.catalogId === next.catalogId); if (!stored) return Promise.reject(new Error('家具数据尚未就绪，请重新加载后重试')); return catalog.save(furnitureGeometryPayload(next, stored)); } : undefined}
      saveAssets={builtinOf(detail.catalogId) ? assets => catalog.saveOverride({ ...builtinOf(detail.catalogId)!, ...assets }) : undefined}
      onOpenChange={v => { if (!v) setDetail(null); }} onChanged={next => { setDetail(next); void catalog.load(); }}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, furniturePrices: { ...current.furniturePrices, [detail.catalogId!]: price } }))} remove={catalog.remove}/>}
  </>;
}
