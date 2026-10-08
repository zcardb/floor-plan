import { useMemo,useState } from 'react';
import { Armchair,Plus,Search,Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categories,library } from '../data/catalog';
import type { LibraryItem } from '../model/types';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { AccountCostSettings } from '../model/costDefaults';
import { CmsFilterBar } from './CmsFilterBar';
import { AccountFurnitureDialog } from './AccountFurnitureDialog';
import { FurnitureShape } from './FurnitureShape';
import { priceOf } from '../model/costs';
import { referenceDesign } from '../data/templates';
import { useAccountCostCommit } from './useAccountCostCommit';
const builtinCounts=Object.fromEntries(categories.map(c=>[c,library.filter(i=>i.category===c).length]));
export function AccountFurnitureLibrary({catalog,defaults,saveDefaults,onDirty,onNew}:{catalog:ReturnType<typeof useFurnitureCatalog>;defaults:AccountCostSettings;saveDefaults:(settings:AccountCostSettings)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onNew:()=>void}){
  const commit=useAccountCostCommit({settings:defaults,save:saveDefaults,onDirty});
  const priceDesign={...referenceDesign(),customCatalog:catalog.items,costSettings:commit.settings};
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[detail,setDetail]=useState<LibraryItem|null>(null);
  const customIds=useMemo(()=>new Set(catalog.items.map(i=>i.catalogId)),[catalog.items]);
  const merged=useMemo(()=>[...catalog.items,...library.filter(l=>!customIds.has(l.catalogId))],[catalog.items,customIds]);
  const total=library.length+catalog.count;
  const chips=[{id:'全部',label:'全部',meta:`${total} 款`},...categories.map(c=>({id:c,label:c,meta:`${(builtinCounts[c]||0)+(catalog.counts[c]||0)} 款`}))];
  const keyword=query.trim(),searching=keyword!=='';
  const visible=merged.filter(i=>searching?i.name.includes(keyword):category==='全部'||i.category===category);
  const blocks=searching||category!=='全部'
    ?[{title:searching?'搜索结果':category,items:visible}]
    :categories.map(c=>({title:c,items:visible.filter(i=>i.category===c)})).filter(b=>b.items.length);
  const card=(it:LibraryItem)=>{
    const custom=customIds.has(it.catalogId!);
    const price=priceOf(priceDesign,'furniturePrices',it.catalogId!);
    const overridden=commit.settings.furniturePrices?.[it.catalogId!]!==undefined;
    return <button className="cms-item-card" key={it.catalogId} disabled={commit.busy||!!commit.pending} onClick={()=>setDetail({...it,price})} aria-label={'查看'+it.name}>
      <span className="cms-item-visual">
        {it.imageUrl?<img src={it.imageUrl} crossOrigin="anonymous" alt={it.name} loading="lazy"/>:<svg viewBox={`${-it.w/2-100} ${-it.d/2-100} ${it.w+200} ${it.d+200}`}><FurnitureShape f={it}/></svg>}
        <span className={'cms-item-badge'+(custom?' custom':'')}>{custom?'自定义':'内置'}</span>
      </span>
      <b>{it.name}</b>
      <small>{it.category} · {it.w} × {it.d} mm</small>
      <span className="cms-item-price">{price===null?<em>未定价</em>:<>{overridden?'账号默认 ':custom?'':'参考价 '}¥{price}</>}</span>
    </button>;
  };
  return <>
    <div className="cms-heading"><div><h1>账号家具库</h1><p>{total} 款家具 · 内置 {library.length} 款 + 自定义 {catalog.count} 款（款式数，不是项目摆放件数）</p></div><Button disabled={commit.busy||!!commit.pending} onClick={onNew}><Plus/>新建家具</Button></div>
    <div className="cms-toolbar" aria-busy={catalog.loading}>
      <div className="cms-search">{catalog.loading?<Loader2 className="animate-spin" size={15} aria-label="加载家具"/>:<Search size={15}/>}<input aria-label="搜索家具" placeholder="搜索家具、家电…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <CmsFilterBar chips={chips} value={searching?'':category} onChange={c=>{setQuery('');setCategory(c);}}/>
    </div>
    {commit.error&&<div className="cost-save-error" role="alert"><span>{commit.error}</span><Button variant="outline" disabled={commit.busy} onClick={()=>void commit.retry()}>重试保存</Button></div>}
    {catalog.error&&<p role="alert" className="form-error">{catalog.error}</p>}
    {blocks.map(b=><section className="cms-category-block" key={b.title}><h2>{b.title}<span>{b.items.length} 款</span></h2><div className="cms-item-grid">{b.items.map(card)}</div></section>)}
    {!catalog.loading&&!visible.length&&<div className="cms-empty"><Armchair size={34}/><h2>没有匹配的家具</h2><p>换个分类，或清空搜索关键词再试。</p></div>}
    {catalog.hasMore&&<div className="cms-more"><Button variant="outline" disabled={catalog.loading} onClick={()=>void catalog.load(true)}>加载更多家具</Button></div>}
    {detail&&<AccountFurnitureDialog key={detail.catalogId} item={{...detail,price:priceOf(priceDesign,'furniturePrices',detail.catalogId!)}} isCustom={customIds.has(detail.catalogId!)} referencePrice={priceOf(priceDesign,'furniturePrices',detail.catalogId!)} onOpenChange={v=>{if(!v)setDetail(null);}} onChanged={next=>{setDetail(next);if(!next)void catalog.load();}} applyDefaultPrice={price=>commit.apply(current=>({...current,furniturePrices:{...current.furniturePrices,[detail.catalogId!]:price}}))} remove={catalog.remove}/>}
  </>;
}
