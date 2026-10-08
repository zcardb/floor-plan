import { useMemo,useState } from 'react';
import { Armchair,Plus,Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categories,library } from '../data/catalog';
import type { LibraryItem } from '../model/types';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { AccountCostSettings } from '../model/costDefaults';
import { CmsFilterBar } from './CmsFilterBar';
import { AccountFurnitureDialog } from './AccountFurnitureDialog';
import { FurnitureShape } from './FurnitureShape';
const builtinCounts=Object.fromEntries(categories.map(c=>[c,library.filter(i=>i.category===c).length]));
export function AccountFurnitureLibrary({catalog,defaults,onNew}:{catalog:ReturnType<typeof useFurnitureCatalog>;defaults:AccountCostSettings;onNew:()=>void}){
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
    const price=custom?it.price??null:defaults.furniturePrices?.[it.catalogId!]??null;
    return <button className="cms-item-card" key={it.catalogId} onClick={()=>setDetail(it)} aria-label={'查看'+it.name}>
      <span className="cms-item-visual">
        {it.imageUrl?<img src={it.imageUrl} crossOrigin="anonymous" alt={it.name} loading="lazy"/>:<svg viewBox={`${-it.w/2-100} ${-it.d/2-100} ${it.w+200} ${it.d+200}`}><FurnitureShape f={it}/></svg>}
        <span className={'cms-item-badge'+(custom?' custom':'')}>{custom?'自定义':'内置'}</span>
      </span>
      <b>{it.name}</b>
      <small>{it.category} · {it.w} × {it.d} mm</small>
      <span className="cms-item-price">{price===null?<em>未定价</em>:<>{custom?'':'参考价 '}¥{price}</>}</span>
    </button>;
  };
  return <>
    <div className="cms-heading"><div><h1>账号家具库</h1><p>{total} 款家具 · 内置 {library.length} 款 + 自定义 {catalog.count} 款（款式数，不是项目摆放件数）</p></div><Button onClick={onNew}><Plus/>新建家具</Button></div>
    <div className="cms-toolbar">
      <div className="cms-search"><Search size={15}/><input aria-label="搜索家具" placeholder="搜索家具、家电…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <CmsFilterBar chips={chips} value={searching?'':category} onChange={c=>{setQuery('');setCategory(c);}}/>
    </div>
    {catalog.error&&<p role="alert" className="form-error">{catalog.error}</p>}
    {catalog.loading&&<p className="cms-status" role="status">正在读取家具…</p>}
    {blocks.map(b=><section className="cms-category-block" key={b.title}><h2>{b.title}<span>{b.items.length} 款</span></h2><div className="cms-item-grid">{b.items.map(card)}</div></section>)}
    {!catalog.loading&&!visible.length&&<div className="cms-empty"><Armchair size={34}/><h2>没有匹配的家具</h2><p>换个分类，或清空搜索关键词再试。</p></div>}
    {catalog.hasMore&&<div className="cms-more"><Button variant="outline" disabled={catalog.loading} onClick={()=>void catalog.load(true)}>加载更多家具</Button></div>}
    {detail&&<AccountFurnitureDialog key={detail.catalogId} item={detail} isCustom={customIds.has(detail.catalogId!)} referencePrice={defaults.furniturePrices?.[detail.catalogId!]??null} onOpenChange={v=>{if(!v)setDetail(null);}} onChanged={next=>{setDetail(next);void catalog.load();}} save={catalog.save} remove={catalog.remove}/>}
  </>;
}
