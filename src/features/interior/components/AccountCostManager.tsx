import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { library, materials } from '../data/catalog';
import { wallMaterials, priceOf, setPrice } from '../model/costs';
import type { AccountCostSettings } from '../model/costDefaults';
import { referenceDesign } from '../data/templates';
import { PriceInput } from './PriceInput';
import { MaterialProcurementEditor } from './MaterialProcurementEditor';
import type { LibraryItem } from '../model/types';
export function AccountCostManager({settings,save,saving,error,items}:{settings:AccountCostSettings;save:(s:AccountCostSettings)=>Promise<boolean>;saving:boolean;error:string;items:LibraryItem[]}) {
  const [draft,setDraft]=useState(settings),[saved,setSaved]=useState(false);
  const design={...referenceDesign(),customCatalog:items,costSettings:draft};
  const change=(fn:Parameters<typeof MaterialProcurementEditor>[0]['change'] extends (fn:infer F)=>void ? F : never)=>{setDraft(fn(design).costSettings||{});setSaved(false);};
  const groups=[
    {group:'floorPrices' as const,title:'地面材料',entries:Object.entries(materials).map(([key,m])=>({key,name:m.name}))},
    {group:'wallPrices' as const,title:'墙面材料',entries:Object.entries(wallMaterials).map(([key,m])=>({key,name:m.name}))},
    {group:'openingPrices' as const,title:'门窗',entries:[{key:'door',name:'门'},{key:'window',name:'窗'}]},
    {group:'constructionPrices' as const,title:'墙体施工',entries:[{key:'build',name:'新建隔墙'},{key:'demolish',name:'墙体拆除'}]},
    {group:'furniturePrices' as const,title:'家具款式',entries:[...items,...library].map(i=>({key:i.catalogId!,name:i.name}))},
  ];
  return <><div className="cms-heading"><div><h1>账号默认成本</h1><p>未单独调价的项目自动继承；人工费用仍由各项目独立填写。</p></div><Button disabled={saving} onClick={async()=>{if(await save(draft))setSaved(true);}}>{saving?'正在保存…':'保存账号默认'}</Button></div>
    {error&&<p role="alert" className="form-error">{error}</p>}{saved&&<p role="status">账号默认已保存，未覆盖项目将使用新配置。</p>}
    <div className="cms-cost-grid">{groups.map(({group,title,entries})=><section className="cms-card" key={group}><h2>{title}</h2>{entries.map(({key,name})=><div className="cost-detail" key={key}><b>{name}</b><small>元 / {group==='furniturePrices'?'件':group==='floorPrices'?(draft.procurement?.[key]?.unit||'m²'):'m²'}</small><PriceInput key={key+String(priceOf(design,group,key))} value={priceOf(design,group,key)} label={name+'账号默认单价'} onApply={v=>change(d=>setPrice(d,group,key,v))}/>{group==='floorPrices'&&<MaterialProcurementEditor design={design} material={key} change={change}/>}</div>)}</section>)}</div></>;
}
