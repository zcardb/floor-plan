import { useState } from 'react';
import { Armchair, Check, CircleHelp, Layers, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categories } from '../data/catalog';
import { priceOf } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { accountCostEntries, accountCostSource, costCategories, filterCostEntries, materialCostCategories, type CostEntry } from '../model/accountCostEntries';
import { referenceDesign } from '../data/templates';
import { CmsFilterBar } from './CmsFilterBar';
import { AccountCostDialog } from './AccountCostDialog';
import { useAccountCostCommit } from './useAccountCostCommit';
import type { LibraryItem, Design } from '../model/types';

export function AccountCostManager({ settings, save, saving, error, items, onDirty, onNew, hasMore, loading, catalogError, loadMore }: {
  settings: AccountCostSettings; save: (settings: AccountCostSettings) => Promise<boolean>; saving: boolean; error: string;
  items: LibraryItem[]; onDirty: (dirty: boolean) => void; onNew: () => void;
  hasMore: boolean; loading: boolean; catalogError: string; loadMore: () => void;
}) {
  const [category, setCategory] = useState('全部'), [query, setQuery] = useState(''), [editing, setEditing] = useState<CostEntry | null>(null);
  const commit = useAccountCostCommit({ settings, save, onDirty });
  const design: Design = { ...referenceDesign(), customCatalog: items, costSettings: commit.settings };
  const entries = accountCostEntries(items, commit.settings);
  const visible = filterCostEntries(entries, category, query);
  const blocks = costCategories.map(title => ({ title, entries: visible.filter(entry => entry.category === title) })).filter(block => block.entries.length);
  const chips = (names: string[]) => names.map(name => ({ id: name, label: name, meta: String(entries.filter(entry => entry.category === name).length) }));
  const busy = saving || commit.busy;
  const failure = error || commit.error;
  const change = (update: (design: Design) => Design) => { void commit.apply(current => update({ ...design, costSettings: current }).costSettings as AccountCostSettings); };
  return <div className="account-cost-page">
    <header className="cms-heading cost-heading">
      <div><span className="cost-eyebrow">工作室价格库</span><h1>账号默认成本</h1><p>在这里设好单价，各项目可直接沿用。</p></div>
      <Button disabled={busy || !!commit.pending} onClick={onNew}><Plus size={16}/>新建家具</Button>
    </header>
    <div className="cost-policy"><CircleHelp size={16}/><p>修改后自动保存，未单独调价的项目自动继承。<span>人工费用仍在各项目中填写，未定价项不计入报价。</span></p></div>
    <div className="cost-controls">
      <div className="cost-search-row">
        <div className="cms-search cost-search" aria-busy={loading}>{loading?<Loader2 className="animate-spin" size={17} aria-label="加载家具"/>:<Search size={17}/>}<input aria-label="搜索材料或家具" placeholder="搜索材料、家具名称…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={16}/></button>}</div>
        <span className="cost-sync" role="status">{busy ? <><Loader2 size={14} className="animate-spin"/>正在保存…</> : failure ? '修改尚未保存' : commit.saved ? <><Check size={14}/>已保存并生效</> : <><Check size={14}/>修改后自动保存</>}</span>
      </div>
      <div className="cost-category-line"><button type="button" className={'cost-all-filter' + (category === '全部' ? ' active' : '')} aria-pressed={category === '全部'} onClick={() => setCategory('全部')}>全部</button><span className="cost-category-label"><Layers size={14}/>材料</span><CmsFilterBar chips={chips(materialCostCategories)} value={category} onChange={setCategory}/></div>
      <div className="cost-category-line"><span className="cost-category-label"><Armchair size={14}/>家具</span><CmsFilterBar chips={chips(categories)} value={category} onChange={setCategory}/></div>
    </div>
    {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{commit.pending && <Button variant="outline" disabled={busy} onClick={() => void commit.retry()}>重试保存</Button>}</div>}
    {catalogError && <p role="alert" className="form-error">{catalogError}</p>}
    <div className="cost-results-heading"><h2>{category === '全部' ? '全部单价' : category + '单价'}<span>{visible.length} 项{hasMore ? ' · 已加载' : ''}</span></h2><span>按需设置，无需全部填写</span></div>
    {blocks.map(block => <section key={block.title} className="cost-list-section" aria-label={block.title + '单价'}>
      <div className="cost-list-section-head"><h3>{block.title}<span>{block.entries.length} 项</span></h3><span>单价 / 单位</span><span>价格来源</span><span className="sr-only">操作</span></div>
      <ul>{block.entries.map(entry => {
        const price = priceOf(design, entry.group, entry.key), source = accountCostSource(design, entry);
        return <li className="cost-list-row" key={entry.group + ':' + entry.key}>
          <b className="cost-entry-name">{entry.name}</b>
          <span className={'cost-entry-price' + (price === null ? ' unset' : '')}>{price === null ? '—' : `¥${price.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small> / {entry.unit}</small></span>
          <span className={'cost-source' + (source === '账号默认' ? ' configured' : '')}>{source}</span>
          <Button type="button" variant="ghost" className="cost-edit" aria-label={'编辑' + entry.name + '单价'} disabled={busy || !!commit.pending} onClick={() => setEditing(entry)}><Pencil size={14}/>编辑</Button>
        </li>;
      })}</ul>
    </section>)}
    {!loading && !visible.length && <div className="cms-empty"><Search size={30}/><h2>没有匹配的项目</h2><p>{hasMore ? '可加载更多家具，或调整分类与搜索。' : '换个分类，或清空搜索再试。'}</p><Button variant="outline" onClick={() => { setCategory('全部'); setQuery(''); }}>清空筛选</Button></div>}
    {hasMore && <div className="cms-more"><Button variant="outline" disabled={loading || busy} onClick={loadMore}>加载更多账号家具款式</Button></div>}
    {editing && <AccountCostDialog group={editing.group} entryKey={editing.key} name={editing.name} groupTitle={editing.category} unit={entries.find(entry => entry.key === editing.key && entry.group === editing.group)?.unit || editing.unit} design={design} change={change} price={priceOf(design, editing.group, editing.key)} busy={busy} error={failure} saved={commit.saved} retry={commit.pending ? () => void commit.retry() : undefined} done={() => { if (!busy) setEditing(null); }}/> }
  </div>;
}
