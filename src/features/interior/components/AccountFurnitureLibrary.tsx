import { useState } from 'react';
import { Armchair, Check, Layers, Loader2, Plus, Search, X } from 'lucide-react';
import { LoadError } from './LoadError';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { notify } from '@/lib/notify';
import { categories } from '../data/catalog';
import { formatMeters } from '../model/lengthUnits';
import { priceOf } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { accountCostEntries, accountCostSource, filterCostEntries, materialCostCategories, type CostEntry, type CostMajor } from '../model/accountCostEntries';
import { referenceDesign } from '../data/templates';
import { furnitureGeometryPayload } from '../model/furnitureGeometrySave';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { CustomFloor, CustomOpening, CustomWall, Design, LibraryItem } from '../model/types';
import { CmsFilterBar } from './CmsFilterBar';
import { CostItemVisual } from './CostItemVisual';
import { AccountCostDialog } from './AccountCostDialog';
import { AccountFurnitureDialog } from './AccountFurnitureDialog';
import { useAccountCostCommit } from './useAccountCostCommit';

type Props = {
  catalog: ReturnType<typeof useFurnitureCatalog>; floors?: CustomFloor[]; walls?: CustomWall[]; openings?: CustomOpening[]; roofs?: CustomWall[]; ceilings?: CustomWall[];
  defaults: AccountCostSettings; saveDefaults: (settings: AccountCostSettings) => Promise<boolean>; saving?: boolean; saveError?: string;
  onDirty: (dirty: boolean) => void; onNew: (category: string) => void; loadError?: string; reload?: () => void;
};
const sizeOf = (entry: CostEntry) => entry.furniture ? ` · ${formatMeters(entry.furniture.w)} × ${formatMeters(entry.furniture.d)} m` : entry.opening ? ` · ${formatMeters(entry.opening.width)} × ${formatMeters(entry.opening.height)} m` : '';

/** 账号家具库：家具与地面、墙面、门窗、屋面、吊顶统一管理，并在这里设置账号默认单价。 */
export function AccountFurnitureLibrary({ catalog, floors = [], walls = [], openings = [], roofs = [], ceilings = [], defaults, saveDefaults, saving = false, saveError = '', onDirty, onNew, loadError = '', reload }: Props) {
  const [category, setCategory] = useState('全部'), [query, setQuery] = useState(''), [editing, setEditing] = useState<CostEntry | null>(null), [detail, setDetail] = useState<LibraryItem | null>(null);
  const commit = useAccountCostCommit({ settings: defaults, save: saveDefaults, onDirty });
  const design: Design = { ...referenceDesign(), customCatalog: catalog.items, customFloors: floors, customWalls: walls, customOpenings: openings, customRoofs: roofs, customCeilings: ceilings, costSettings: commit.settings };
  const entries = accountCostEntries(catalog.items, commit.settings, floors, walls, openings, { roofs, ceilings });
  const visible = filterCostEntries(entries, category, query);
  const blocks = [...materialCostCategories, ...categories].map(title => ({ title, entries: visible.filter(entry => entry.category === title) })).filter(block => block.entries.length);
  const groups: { major: CostMajor; icon: typeof Layers; names: string[] }[] = [{ major: '硬装', icon: Layers, names: materialCostCategories }, { major: '软装', icon: Armchair, names: categories }];
  const chips = (names: string[]) => names.map(name => ({ id: name, label: name, meta: String(entries.filter(entry => entry.category === name).length) }));
  const pick = (next: string) => setCategory(current => current === next ? '全部' : next);
  const busy = saving || commit.busy, locked = busy || !!commit.pending;
  const failure = saveError || commit.error;
  const change = (update: (design: Design) => Design) => commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings);
  const retry = async () => { if (await commit.retry()) notify.success('账号默认价已保存并生效'); };
  const open = (entry: CostEntry) => entry.furniture ? setDetail(entry.furniture) : setEditing(entry);
  const customIds = new Set(catalog.items.map(item => item.catalogId));
  return <div className="account-cost-page">
    <header className="cms-heading cost-heading">
      <div><span className="cost-eyebrow">工作室素材库</span><h1>账号家具库</h1><p>家具、地面、墙面、门窗、屋面与吊顶都在这里管理，设好单价后各项目直接沿用。</p></div>
    </header>
    <div className="cost-controls">
      <div className="cost-toolbar">
        <div className="cms-search cost-search" aria-busy={catalog.loading}>{catalog.loading ? <Loader2 className="animate-spin" size={17} aria-label="加载家具"/> : <Search size={17}/>}<input aria-label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <EditorTooltip label="清空搜索"><button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={16}/></button></EditorTooltip>}</div>
        {(busy || failure || commit.saved) && <span className="cost-sync" role="status">{busy ? <><Loader2 size={14} className="animate-spin"/>正在保存…</> : failure ? '修改尚未保存' : <><Check size={14}/>已保存并生效</>}</span>}
        <EditorTooltip label="新建家具" disabled={locked}>
          <Button className="cost-new" disabled={locked} onClick={() => onNew(category)}><Plus size={16}/>新建家具</Button>
        </EditorTooltip>
      </div>
      <div className="cost-group-columns">
        {groups.map(group => <div className={'cost-group cost-group--' + (group.major === '硬装' ? 'hard' : 'soft')} key={group.major}>
          <div className="cost-group-label"><group.icon size={15}/><span>{group.major}</span><small>{entries.filter(entry => entry.major === group.major).length} 项</small></div>
          <CmsFilterBar label={group.major + '分类'} chips={chips(group.names)} value={category} onChange={pick}/>
        </div>)}
      </div>
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void retry()}>重试保存</Button>}</div>}
    {(loadError || catalog.error) && <LoadError title="家具与材料读取失败" message={loadError || catalog.error} retrying={catalog.loading} onRetry={reload || (() => void catalog.load())}/>}
    <div className="cost-results-heading"><h2>{category === '全部' ? '全部单价' : category + '单价'}<span>{visible.length} 项{catalog.hasMore ? ' · 已加载' : ''}</span></h2>{category === '全部' ? <span>按需设置，无需全部填写</span> : <EditorTooltip label="查看全部"><button type="button" className="cost-clear-filter" onClick={() => setCategory('全部')}><X size={14}/>查看全部</button></EditorTooltip>}</div>
    {blocks.map(block => <section key={block.title} className="cms-category-block" aria-label={block.title + '单价'}>
      <h2>{block.title}<span>{block.entries.length} 项</span></h2>
      <div className="cms-item-grid">{block.entries.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        return <EditorTooltip key={entry.group + ':' + entry.key} label={entry.name} disabled={locked}>
          <button type="button" className="cms-item-card cms-item-card--cost" aria-label={(entry.furniture ? '查看' : '编辑') + entry.name + (entry.furniture ? '' : '单价')} disabled={locked} onClick={() => open(entry)}>
            <span className="cms-item-visual"><CostItemVisual entry={entry}/><span className={'cms-item-badge' + (entry.custom ? ' custom' : '')}>{entry.custom && source !== '账号默认' && source !== '未定价' ? '自定义' : source}</span></span>
            <b>{entry.name}</b><small>{entry.category}{sizeOf(entry)}</small>
            <span className="cms-item-price">{price === null ? '未定价' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {entry.unit}</small></span>
          </button>
        </EditorTooltip>;
      })}</div>
    </section>)}
    {!catalog.loading && !visible.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的条目</h2><p>{catalog.hasMore ? '可加载更多家具，或调整分类与搜索。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={() => { setCategory('全部'); setQuery(''); }}>清空筛选</Button></div>}
    {catalog.hasMore && <div className="cms-more"><Button variant="outline" loading={catalog.loading} disabled={busy} onClick={() => void catalog.load(true)}>加载更多账号家具款式</Button></div>}
    {editing && <AccountCostDialog group={editing.group} entryKey={editing.key} name={editing.name} groupTitle={editing.category} unit={entries.find(entry => entry.key === editing.key && entry.group === editing.group)?.unit || editing.unit} design={design} change={change} price={priceOf(design, editing.group, editing.key)} busy={busy} error={failure} saved={commit.saved} retry={commit.pending ? () => void retry() : undefined} done={() => { if (!busy) setEditing(null); }}/>}
    {detail && <AccountFurnitureDialog key={detail.catalogId} item={{ ...detail, price: priceOf(design, 'furniturePrices', detail.catalogId!) }} isCustom={customIds.has(detail.catalogId!)} referencePrice={priceOf(design, 'furniturePrices', detail.catalogId!)} commitBusy={commit.busy} commitError={commit.error} retryPrice={commit.pending ? commit.retry : undefined} saved={commit.saved}
      saveGeometry={next => { const stored = catalog.items.find(item => item.catalogId === next.catalogId); if (!stored) return Promise.reject(new Error('家具数据尚未就绪，请重新加载后重试')); return catalog.save(furnitureGeometryPayload(next, stored)); }}
      onOpenChange={v => { if (!v) setDetail(null); }} onChanged={next => { setDetail(next); void catalog.load(); }}
      applyDefaultPrice={price => commit.apply(current => ({ ...current, furniturePrices: { ...current.furniturePrices, [detail.catalogId!]: price } }))} remove={catalog.remove}/>}
  </div>;
}
