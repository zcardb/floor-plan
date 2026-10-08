import { useEffect,useRef,useState } from 'react';
import { Plus,Loader2,Cloud } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { categories,library } from '../data/catalog';
import { uid,type LibraryItem } from '../model/types';
import { validPrice } from '../model/costs';
import { useFurnitureImage } from '../cloud/useFurnitureImage';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { FurnitureShape } from './FurnitureShape';
export function CustomFurnitureDialog({open,onOpenChange,loggedIn,login,onCreate,onImport,ownerKey,accountOnly=false}:{open:boolean;onOpenChange:(v:boolean)=>void;loggedIn:boolean;login:()=>void;onCreate:(i:LibraryItem)=>void;onImport:(i:LibraryItem)=>void;ownerKey:string;accountOnly?:boolean}){
  const [name,setName]=useState(''),[category,setCategory]=useState('客厅'),[type,setType]=useState('sofa'),[w,setW]=useState('1800'),[d,setD]=useState('800'),[h,setH]=useState('800'),[price,setPrice]=useState(''),[color,setColor]=useState('#b7c4b0'),[account,setAccount]=useState(accountOnly),[error,setError]=useState(''),[saving,setSaving]=useState(false),[tab,setTab]=useState('create'),[pending,setPending]=useState<LibraryItem|null>(null);
  const ai=useFurnitureImage(),catalog=useFurnitureCatalog(),cancel=ai.cancel,reset=catalog.reset;
  const epoch=useRef(0),lock=useRef(false),id=useRef(uid()),pendingRef=useRef<LibraryItem|null>(null),latest=useRef({open,ownerKey}); latest.current={open,ownerKey};
  useEffect(()=>{const generation=epoch;epoch.current++;lock.current=false;pendingRef.current=null;setPending(null);setSaving(false);setError('');cancel();reset();id.current=uid();return()=>{generation.current++;};},[open,ownerKey,cancel,reset]);
  const types=[...new Map(library.map(l=>[l.type,l])).values()];
  const finish=async(item:LibraryItem,run:number)=>{
    if(run!==epoch.current||!latest.current.open)return;
    setSaving(true);
    try { if(account||accountOnly)await catalog.save(item);if(run!==epoch.current)return;onCreate(item);pendingRef.current=null;setPending(null);setName('');onOpenChange(false); }
    catch(e){if(run===epoch.current)setError(e instanceof Error?e.message:'保存失败，图片已保留，请重试保存');}
    finally {if(run===epoch.current)setSaving(false);}
  };
  const create=async(parametersOnly=false)=>{
    if(!loggedIn){login();return;}if(lock.current)return;
    const width=Number(w),depth=Number(d),height=Number(h),amount=price.trim()===''?null:Number(price);
    if(!name.trim()||![width,depth].every(n=>Number.isFinite(n)&&n>=50&&n<=20000)||!Number.isFinite(height)||height<50||height>8000||(amount!==null&&!validPrice(amount))){setError('请填写名称、有效尺寸及非负单价');return;}
    lock.current=true;setError('');const run=epoch.current;
    let item=pendingRef.current||{catalogId:id.current,name:name.trim(),category,type,w:width,d:depth,height,color,price:amount};
    pendingRef.current=item;setPending(item);
    try {
      if(!parametersOnly&&!item.imageUrl){const url=await ai.generate(item);if(run!==epoch.current)return;if(!url)return;item={...item,imageUrl:url};pendingRef.current=item;setPending(item);}
      await finish(item,run);
    }finally {if(run===epoch.current)lock.current=false;}
  };
  const reference=pending||{name,category,type,w:Number(w)||1800,d:Number(d)||800,color};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="custom-furniture-dialog"><DialogHeader><DialogTitle>新建你的家具</DialogTitle><DialogDescription>{accountOnly?'保存到账号家具库，可在各项目中使用。':'默认保存当前项目，可选同时加入账号库。'}创建时自动生成统一俯视外观图；画布仍使用参考几何，不是3D建模。</DialogDescription></DialogHeader>
  {!accountOnly&&<div className="project-tabs"><button className={tab==='create'?'active':''} onClick={()=>setTab('create')}><Plus size={14}/>新建家具</button><button className={tab==='account'?'active':''} onClick={()=>{setTab('account');void catalog.load();}}><Cloud size={14}/>账号家具库</button></div>}
  {tab==='account'?<><p className="muted-note">{catalog.count} 款 · 账号目录款式数</p>{catalog.error&&<p className="form-error">{catalog.error}</p>}<div className="account-furniture-list">{catalog.items.map(i=><button key={i.catalogId} onClick={()=>{if(!loggedIn)return;onImport(i);onOpenChange(false);}}>{i.imageUrl?<img src={i.imageUrl} crossOrigin="anonymous" alt={i.name}/>:<svg viewBox={`${-i.w/2-100} ${-i.d/2-100} ${i.w+200} ${i.d+200}`}><FurnitureShape f={i}/></svg>}<span>{i.name}<small>{i.category} · {i.price===null?'未定价':`¥${i.price}`}</small></span><Plus size={14}/></button>)}</div>{catalog.hasMore&&<Button disabled={catalog.loading} onClick={()=>void catalog.load(true)}>加载更多</Button>}{!catalog.loading&&!catalog.items.length&&<p>账号库暂无家具。</p>}</>:<form onSubmit={e=>{e.preventDefault();void create();}}><div className="custom-furniture-layout"><fieldset className="custom-furniture-fields" disabled={ai.busy||saving||!!pending}><label>名称<input aria-label="家具名称" maxLength={100} required value={name} onChange={e=>setName(e.target.value)}/></label><label>分类<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>参考模型<select value={type} onChange={e=>setType(e.target.value)}>{types.map(i=><option key={i.type} value={i.type}>{i.name}</option>)}</select></label><div className="custom-dimensions">{[['宽 mm',w,setW],['深 mm',d,setD],['高 mm',h,setH]].map(([label,value,setter])=><label key={String(label)}>{String(label)}<input type="number" value={String(value)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}/></label>)}</div><label>价格 / 元每件<input type="number" min={0} placeholder="未定价" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>模型颜色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label></fieldset><div className="custom-image-panel"><div className="custom-image-preview">{pending?.imageUrl||ai.image?<img src={pending?.imageUrl||ai.image} crossOrigin="anonymous" alt="家具生成外观"/>:ai.busy?<><Loader2 className="animate-spin"/><span>正在生成统一风格外观…</span></>:<><svg viewBox={`${-reference.w/2-100} ${-reference.d/2-100} ${reference.w+200} ${reference.d+200}`}><FurnitureShape f={reference}/></svg><span>参考符号 · 创建时自动生成外观图</span></>}</div><small>生成可能消耗 AI 额度；每次创建只提交一次，不随字段修改生成。</small>{ai.error&&<p className="form-error" role="alert">{ai.error}</p>}</div></div>{!accountOnly&&<label className="account-catalog-option"><input type="checkbox" checked={account} disabled={ai.busy||saving||!!pending} onChange={e=>setAccount(e.target.checked)}/>同时添加到账号家具库</label>}{error&&<p className="form-error" role="alert">{error}</p>}{pending&&!ai.busy&&!saving&&<div className="visual-form-actions">{!pending.imageUrl&&<Button type="button" variant="outline" onClick={()=>void create(true)}>仅保存家具参数</Button>}<Button type="button" variant="ghost" onClick={()=>{pendingRef.current=null;setPending(null);cancel();id.current=uid();}}>返回修改参数</Button></div>}<div className="visual-form-actions"><Button type="button" variant="ghost" onClick={()=>onOpenChange(false)}>取消</Button><Button disabled={ai.busy||saving}><Plus/>{saving?'正在保存…':pending?.imageUrl?'重试保存（不重新生成）':pending?'重试生成并创建':'创建家具'}</Button></div></form>}
  </DialogContent></Dialog>;
}
