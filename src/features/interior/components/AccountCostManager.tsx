import { useState,type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { library, materials } from '../data/catalog';
import { wallMaterials, priceOf, type PriceGroup } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { referenceDesign } from '../data/templates';
import { CmsFilterBar } from './CmsFilterBar';
import { AccountCostDialog } from './AccountCostDialog';
import type { LibraryItem,Design } from '../model/types';
type CostEntry={group:PriceGroup;key:string;name:string;title:string;unit:string};
export function AccountCostManager({settings,save,saving,error,items,onDirty}:{settings:AccountCostSettings;save:(s:AccountCostSettings)=>Promise<boolean>;saving:boolean;error:string;items:LibraryItem[];onDirty:(dirty:boolean)=>void}){
  const [draft,setDraft]=useState(settings),[saved,setSaved]=useState(false),[category,setCategory]=useState('全部'),[editing,setEditing]=useState<CostEntry|null>(null);
  const design:Design={...referenceDesign(),customCatalog:items,costSettings:draft};
  const change=(fn:(d:Design)=>Design)=>{setDraft((fn(design).costSettings as AccountCostSettings)||{});setSaved(false);onDirty(true);};
  const own=(group:PriceGroup,key:string)=>((draft[group] as Record<string,number|null>|undefined)||{})[key];
  const unitOf=(group:PriceGroup,key:string)=>group==='furniturePrices'?'件':group==='floorPrices'?(draft.procurement?.[key]?.unit||'m²'):'m²';
  const furniture=[...items,...library.filter(l=>!items.some(i=>i.catalogId===l.catalogId))];
  const groups=[
    {group:'floorPrices' as const,title:'地面材料',entries:Object.entries(materials).map(([key,m])=>({key,name:m.name}))},
    {group:'wallPrices' as const,title:'墙面材料',entries:Object.entries(wallMaterials).map(([key,m])=>({key,name:m.name}))},
    {group:'openingPrices' as const,title:'门窗',entries:[{key:'door',name:'门'},{key:'window',name:'窗'}]},
    {group:'constructionPrices' as const,title:'墙体施工',entries:[{key:'build',name:'新建隔墙'},{key:'demolish',name:'墙体拆除'}]},
    {group:'furniturePrices' as const,title:'家具款式',entries:furniture.map(i=>({key:i.catalogId!,name:i.name}))},
  ];
  const all:CostEntry[]=groups.flatMap(({group,title,entries})=>entries.map(({key,name})=>({group,key,name,title,unit:unitOf(group,key)})));
  const isPriced=(e:{group:PriceGroup;key:string})=>typeof own(e.group,e.key)==='number';
  const priced=all.filter(isPriced).length,unpriced=all.length-priced;
  const chips=[{id:'全部',label:'全部',meta:`${priced}/${all.length}`},...groups.map(g=>({id:g.group,label:g.title,meta:`${g.entries.filter(e=>isPriced({group:g.group,key:e.key})).length}/${g.entries.length}`}))];
  const list=category==='全部'?all:all.filter(e=>e.group===category);
  const progress={'--cms-progress':`${all.length?Math.round(priced/all.length*100):0}%`} as CSSProperties;
  return <>
    <div className="cms-heading"><div><h1>账号默认成本</h1><p>未单独调价的项目自动继承；人工费用仍由各项目独立填写。</p></div><Button disabled={saving} onClick={async()=>{if(await save(draft)){setSaved(true);onDirty(false);}}}>{saving?'正在保存…':'保存账号默认'}</Button></div>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {saved&&<p role="status" className="cms-status">账号默认已保存，未覆盖项目将使用新配置。</p>}
    <div className="cms-progress" role="status" style={progress}>
      <span className="cms-progress-track"><b/></span>
      <span>已定价 {priced} / 共 {all.length} 项</span>
      {unpriced>0&&<span className="cms-progress-note">{unpriced} 项未定价，仍按内置参考价或不计入报价</span>}
    </div>
    <CmsFilterBar chips={chips} value={category} onChange={setCategory}/>
    <div className="cms-item-grid">{list.map(e=>{
      const price=priceOf(design,e.group,e.key);
      return <button className="cms-item-card cms-item-card--cost" key={e.group+e.key} onClick={()=>setEditing(e)}>
        <small className="cms-item-group">{e.title}</small>
        <b>{e.name}</b>
        <span className="cms-item-unit">元 / {e.unit}</span>
        <strong>{price===null?'未定价':`¥${price.toLocaleString('zh-CN',{maximumFractionDigits:2})}`}</strong>
        <span className={'cms-item-source'+(isPriced(e)?' set':'')}>{own(e.group,e.key)!==undefined?'账号默认':'内置参考'}</span>
      </button>;
    })}</div>
    {editing&&<AccountCostDialog group={editing.group} entryKey={editing.key} name={editing.name} groupTitle={editing.title} unit={editing.unit} design={design} change={change} price={priceOf(design,editing.group,editing.key)} done={()=>setEditing(null)}/>}
  </>;
}
