import { useEffect,useRef,useState } from 'react';
import { Plus,Loader2,Cloud } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover,PopoverContent,PopoverTrigger } from '@/components/ui/popover';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { categories } from '../data/catalog';
import { FURNITURE_COLORS } from '../data/palette';
import { uid,type LibraryItem } from '../model/types';
import { validPrice } from '../model/costs';
import { useFurnitureImage } from '../cloud/useFurnitureImage';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { FurnitureShape } from './FurnitureShape';
type Props = { open:boolean; onOpenChange:(v:boolean)=>void; loggedIn:boolean; login:()=>void; onCreate:(i:LibraryItem)=>void; onImport:(i:LibraryItem)=>void; ownerKey:string; accountOnly?:boolean };
const tabTrigger = 'gap-[5px] rounded px-2.5 py-1.5 text-[11px] max-[700px]:px-[7px] max-[700px]:text-[10px]';
export function CustomFurnitureDialog({open,onOpenChange,loggedIn,login,onCreate,onImport,ownerKey,accountOnly=false}:Props){
  const [name,setName]=useState(''),[category,setCategory]=useState('客厅'),[w,setW]=useState('1800'),[d,setD]=useState('800'),[h,setH]=useState('800'),[price,setPrice]=useState(''),[color,setColor]=useState('#b7c4b0'),[account,setAccount]=useState(accountOnly),[error,setError]=useState(''),[saving,setSaving]=useState(false),[tab,setTab]=useState('create'),[pending,setPending]=useState<LibraryItem|null>(null),[colorOpen,setColorOpen]=useState(false);
  const ai=useFurnitureImage(),catalog=useFurnitureCatalog(),cancel=ai.cancel,reset=catalog.reset;
  const epoch=useRef(0),lock=useRef(false),id=useRef(uid()),pendingRef=useRef<LibraryItem|null>(null),latest=useRef({open,ownerKey}); latest.current={open,ownerKey};
  useEffect(()=>{const generation=epoch;epoch.current++;lock.current=false;pendingRef.current=null;setPending(null);setSaving(false);setError('');cancel();reset();id.current=uid();return()=>{generation.current++;};},[open,ownerKey,cancel,reset]);
  const type='sofa';
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
  const locked=ai.busy||saving||!!pending;
  const dimensions:[string,string,string,(v:string)=>void][]=[['宽 mm','furniture-width',w,setW],['深 mm','furniture-depth',d,setD],['高 mm','furniture-height',h,setH]];
  const accountPanel=<>
    <p className="muted-note">{catalog.count} 款 · 账号目录款式数</p>
    {catalog.error&&<p className="form-error">{catalog.error}</p>}
    <div className="account-furniture-list">{catalog.items.map(i=><button key={i.catalogId} onClick={()=>{if(!loggedIn)return;onImport(i);onOpenChange(false);}}>{i.imageUrl?<img src={i.imageUrl} crossOrigin="anonymous" alt={i.name}/>:<svg viewBox={`${-i.w/2-100} ${-i.d/2-100} ${i.w+200} ${i.d+200}`}><FurnitureShape f={i}/></svg>}<span>{i.name}<small>{i.category} · {i.price===null?'未定价':`¥${i.price}`}</small></span><Plus size={14}/></button>)}</div>
    {catalog.hasMore&&<Button disabled={catalog.loading} onClick={()=>void catalog.load(true)}>加载更多</Button>}
    {!catalog.loading&&!catalog.items.length&&<p>账号库暂无家具。</p>}
  </>;
  const createForm=<form onSubmit={e=>{e.preventDefault();void create();}}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={locked}>
        <div className="custom-field">
          <Label htmlFor="furniture-name">名称</Label>
          <Input id="furniture-name" aria-label="家具名称" maxLength={100} required value={name} disabled={locked} onChange={e=>setName(e.target.value)}/>
        </div>
        <div className="custom-field">
          <Label htmlFor="furniture-category">分类</Label>
          <Select value={category} onValueChange={setCategory} disabled={locked}>
            <SelectTrigger id="furniture-category" className="h-9 text-xs"><SelectValue/></SelectTrigger>
            <SelectContent>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="custom-dimensions">{dimensions.map(([label,fieldId,value,setter])=><div className="custom-field" key={fieldId}><Label htmlFor={fieldId}>{label}</Label><Input id={fieldId} type="number" value={value} disabled={locked} onChange={e=>setter(e.target.value)}/></div>)}</div>
        <div className="custom-field">
          <Label htmlFor="furniture-price">价格 / 元每件</Label>
          <Input id="furniture-price" type="number" min={0} placeholder="未定价" value={price} disabled={locked} onChange={e=>setPrice(e.target.value)}/>
        </div>
        <div className="custom-color-field">
          <span>模型颜色</span>
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="furniture-color-trigger" disabled={locked} aria-label="模型颜色">
                <span className="furniture-color-swatch" style={{background:color}} aria-hidden="true"/>{color.toUpperCase()}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="furniture-color-panel">
              <div className="furniture-color-grid" role="group" aria-label="常用颜色">{FURNITURE_COLORS.map(c=><button key={c} type="button" className={c===color?'selected':''} style={{background:c}} title={'设置颜色 '+c} aria-label={'设置颜色 '+c} onClick={()=>{setColor(c);setColorOpen(false);}}/>)}</div>
              <label className="furniture-color-custom">自定义颜色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
            </PopoverContent>
          </Popover>
        </div>
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview">{pending?.imageUrl||ai.image?<img src={pending?.imageUrl||ai.image} crossOrigin="anonymous" alt="家具生成外观"/>:ai.busy?<><Loader2 className="animate-spin"/><span>正在生成统一风格外观…</span></>:<><svg viewBox={`${-reference.w/2-100} ${-reference.d/2-100} ${reference.w+200} ${reference.d+200}`}><FurnitureShape f={reference}/></svg><span>参考符号 · 创建时自动生成外观图</span></>}</div>
        <small>生成可能消耗 AI 额度；每次创建只提交一次，不随字段修改生成。</small>
        {ai.error&&<p className="form-error" role="alert">{ai.error}</p>}
      </div>
    </div>
    {!accountOnly&&<div className="account-catalog-option"><Checkbox id="furniture-account" checked={account} disabled={locked} onCheckedChange={v=>setAccount(v===true)}/><Label htmlFor="furniture-account" className="text-[11px]">同时添加到账号家具库</Label></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {pending&&!ai.busy&&!saving&&<div className="visual-form-actions">{!pending.imageUrl&&<Button type="button" variant="outline" onClick={()=>void create(true)}>仅保存家具参数</Button>}<Button type="button" variant="ghost" onClick={()=>{pendingRef.current=null;setPending(null);cancel();id.current=uid();}}>返回修改参数</Button></div>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" onClick={()=>onOpenChange(false)}>取消</Button><Button type="submit" disabled={ai.busy||saving}><Plus/>{saving?'正在保存…':pending?.imageUrl?'重试保存（不重新生成）':pending?'重试生成并创建':'创建家具'}</Button></div>
  </form>;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="custom-furniture-dialog"><DialogHeader><DialogTitle>新建你的家具</DialogTitle><DialogDescription>{accountOnly?'保存到账号家具库，可在各项目中使用。':'默认保存当前项目，可选同时加入账号库。'}创建时自动生成统一俯视外观图；画布仍使用参考几何，不是3D建模。</DialogDescription></DialogHeader>
  {accountOnly?createForm:<Tabs value={tab} onValueChange={next=>{setTab(next);if(next==='account')void catalog.load();}}><TabsList className="project-tabs"><TabsTrigger value="create" className={tabTrigger}><Plus size={14}/>新建家具</TabsTrigger><TabsTrigger value="account" className={tabTrigger}><Cloud size={14}/>账号家具库</TabsTrigger></TabsList><TabsContent value="create">{createForm}</TabsContent><TabsContent value="account">{accountPanel}</TabsContent></Tabs>}
  </DialogContent></Dialog>;
}
