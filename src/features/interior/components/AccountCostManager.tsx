import { useState } from 'react';
import { Armchair, Check, Layers, Loader2, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categories } from '../data/catalog';
import { formatMeters } from '../model/lengthUnits';
import { priceOf } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { accountCostEntries, accountCostSource, filterCostEntries, materialCostCategories, type CostEntry, type CostMajor } from '../model/accountCostEntries';
import { referenceDesign } from '../data/templates';
import { CmsFilterBar } from './CmsFilterBar';
import { CostItemVisual } from './CostItemVisual';
import { AccountCostDialog } from './AccountCostDialog';
import { useAccountCostCommit } from './useAccountCostCommit';
import type { LibraryItem, Design } from '../model/types';

export function AccountCostManager({ settings, save, saving, error, items, onDirty, onNew, hasMore, loading, catalogError, loadMore }: {
  settings: AccountCostSettings; save: (settings: AccountCostSettings) => Promise<boolean>; saving: boolean; error: string;
  items: LibraryItem[]; onDirty: (dirty: boolean) => void; onNew: (category: string) => void;
  hasMore: boolean; loading: boolean; catalogError: string; loadMore: () => void;
}) {
  const [category, setCategory] = useState('全部'), [query, setQuery] = useState(''), [editing, setEditing] = useState<CostEntry | null>(null);
  const commit = useAccountCostCommit({ settings, save, onDirty });
  const design: Design = { ...referenceDesign(), customCatalog: items, costSettings: commit.settings };
  const entries = accountCostEntries(items, commit.settings);
  const visible = filterCostEntries(entries, category, query);
  const blocks = [...materialCostCategories, ...categories].map(title => ({ title, entries: visible.filter(entry => entry.category === title) })).filter(block => block.entries.length);
  const groups: { major: CostMajor; icon: typeof Layers; names: string[] }[] = [{ major: '硬装', icon: Layers, names: materialCostCategories }, { major: '软装', icon: Armchair, names: categories }];
  const chips = (names: string[]) => names.map(name => ({ id: name, label: name, meta: String(entries.filter(entry => entry.category === name).length) }));
  const pick = (next: string) => setCategory(current => current === next ? '全部' : next);
  const busy = saving || commit.busy;
  const failure = error || commit.error;
  const change = (update: (design: Design) => Design) => { void commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings); };
  return <div className="account-cost-page">
    <header className="cms-heading cost-heading">
      <div><span className="cost-eyebrow">工作室价格库</span><h1>账号默认成本</h1><p>在这里设好单价，各项目可直接沿用。</p></div>
    </header>
    <div className="cost-controls">
      <div className="cost-toolbar">
        <div className="cms-search cost-search" aria-busy={loading}>{loading?<Loader2 className="animate-spin" size={17} aria-label="加载家具"/>:<Search size={17}/>}<input aria-label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={16}/></button>}</div>
        {(busy || failure || commit.saved) && <span className="cost-sync" role="status">{busy ? <><Loader2 size={14} className="animate-spin"/>正在保存…</> : failure ? '修改尚未保存' : <><Check size={14}/>已保存并生效</>}</span>}
        <Button className="cost-new" disabled={busy || !!commit.pending} onClick={onNew}><Plus size={16}/>新建家具</Button>
      </div>
      <div className="cost-group-columns">
        {groups.map(group => <div className={'cost-group cost-group--' + (group.major === '硬装' ? 'hard' : 'soft')} key={group.major}>
          <div className="cost-group-label"><group.icon size={15}/><span>{group.major}</span><small>{entries.filter(entry => entry.major === group.major).length} 项</small></div>
          <CmsFilterBar label={group.major + '分类'} chips={chips(group.names)} value={category} onChange={pick}/>
        </div>)}
      </div>
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void commit.retry()}>重试保存</Button>}</div>}
    {catalogError && <p role="alert" className="form-error">{catalogError}</p>}
    <div className="cost-results-heading"><h2>{category === '全部' ? '全部单价' : category + '单价'}<span>{visible.length} 项{hasMore ? ' · 已加载' : ''}</span></h2>{category === '全部' ? <span>按需设置，无需全部填写</span> : <button type="button" className="cost-clear-filter" onClick={() => setCategory('全部')}><X size={14}/>查看全部</button>}</div>
    {blocks.map(block => <section key={block.title} className="cms-category-block" aria-label={block.title + '单价'}>
      <h2>{block.title}<span>{block.entries.length} 项</span></h2>
      <div className="cms-item-grid">{block.entries.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        return <button type="button" className="cms-item-card cms-item-card--cost" key={entry.group + ':' + entry.key} aria-label={'编辑' + entry.name + '单价'} disabled={busy || !!commit.pending} onClick={() => setEditing(entry)}>
          <span className="cms-item-visual"><CostItemVisual entry={entry}/><span className="cms-item-badge">{source}</span></span>
          <b>{entry.name}</b><small>{entry.category}{entry.furniture?` · ${formatMeters(entry.furniture.w)} × ${formatMeters(entry.furniture.d)} m`:''}</small>
          <span className="cms-item-price">{price === null ? '未定价' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {entry.unit}</small></span>
        </button>;
      })}</div>
    </section>)}
    {!loading && !visible.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的项目</h2><p>{hasMore ? '可加载更多家具，或调整分类与搜索。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={() => { setCategory('全部'); setQuery(''); }}>清空筛选</Button></div>}
    {hasMore && <div className="cms-more"><Button variant="outline" disabled={loading || busy} onClick={loadMore}>加载更多账号家具款式</Button></div>}
    {editing && <AccountCostDialog group={editing.group} entryKey={editing.key} name={editing.name} groupTitle={editing.category} unit={entries.find(entry => entry.key === editing.key && entry.group === editing.group)?.unit || editing.unit} design={design} change={change} price={priceOf(design, editing.group, editing.key)} busy={busy} error={failure} saved={commit.saved} retry={commit.pending ? () => void commit.retry() : undefined} done={() => { if (!busy) setEditing(null); }}/> }
  </div>;
}
