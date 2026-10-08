import { useEffect,useRef,useState } from 'react';
import { Plus,Loader2,Cloud } from 'lucide-react';
import { LoadError } from './LoadError';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select,SelectContent,SelectGroup,SelectItem,SelectLabel,SelectSeparator,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { categories } from '../data/catalog';
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { uid,type CustomFloor,type CustomOpening,type CustomWall,type LibraryItem } from '../model/types';
import { FLOOR_CATEGORY,customFloorMaterial,floorPatterns } from '../model/floorMaterials';
import { useFloorCatalog } from '../cloud/useFloorCatalog';
import { useWallCatalog } from '../cloud/useWallCatalog';
import { useOpeningCatalog } from '../cloud/useOpeningCatalog';
import { HARD_CATEGORIES,OPENING_CATEGORY,WALL_CATEGORY } from '../model/hardMaterials';
import { CustomWallForm } from './CustomWallForm';
import { CustomOpeningForm } from './CustomOpeningForm';
import { AccountMaterialList } from './AccountMaterialList';
import { ColorPickerField } from './ColorPickerField';
import { CustomFloorForm } from './CustomFloorForm';
import { FloorSwatch } from './FloorSwatch';
import { validPrice } from '../model/costs';
import { parseMeterDraft } from '../model/lengthUnits';
import { useFurnitureImage } from '../cloud/useFurnitureImage';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { FurnitureShape } from './FurnitureShape';
import { furnitureTypes, resolvedFurnitureType, appearanceDimensions, needsParameterOnly, type FurnitureOutline } from '../model/furnitureAppearance';
import { notify } from '@/lib/notify';
type Props = { open:boolean; onOpenChange:(v:boolean)=>void; loggedIn:boolean; login:()=>void; onCreate:(i:LibraryItem)=>void; onImport:(i:LibraryItem)=>void; onCreateFloor?:(f:CustomFloor)=>void; onCreateWall?:(w:CustomWall)=>void; onCreateOpening?:(o:CustomOpening)=>void; ownerKey:string; accountOnly?:boolean; initialCategory?:string };
const tabTrigger = 'gap-[5px] rounded px-2.5 py-1.5 text-[11px] max-[700px]:px-[7px] max-[700px]:text-[10px]';
export function CustomFurnitureDialog({open,onOpenChange,loggedIn,login,onCreate,onImport,onCreateFloor,onCreateWall,onCreateOpening,ownerKey,accountOnly=false,initialCategory='客厅'}:Props){
  const [name,setName]=useState(''),[category,setCategory]=useState(()=>newFurnitureCategory(initialCategory)),[w,setW]=useState('1.8'),[d,setD]=useState('0.8'),[h,setH]=useState('0.8'),[price,setPrice]=useState(''),[color,setColor]=useState('#b7c4b0'),[account,setAccount]=useState(accountOnly),[error,setError]=useState(''),[saving,setSaving]=useState(false),[tab,setTab]=useState('create'),[pending,setPending]=useState<LibraryItem|null>(null);
  const ai=useFurnitureImage(),catalog=useFurnitureCatalog(),floors=useFloorCatalog(),walls=useWallCatalog(),openings=useOpeningCatalog(),cancel=ai.cancel,reset=catalog.reset;
  const epoch=useRef(0),lock=useRef(false),id=useRef(uid()),pendingRef=useRef<LibraryItem|null>(null),latest=useRef({open,ownerKey}); latest.current={open,ownerKey};
  useEffect(()=>{const generation=epoch;epoch.current++;lock.current=false;pendingRef.current=null;setPending(null);setSaving(false);setError('');cancel();reset();id.current=uid();return()=>{generation.current++;};},[open,ownerKey,cancel,reset]);
  const loadCatalog=catalog.load,loadFloors=floors.load,loadWalls=walls.load,loadOpenings=openings.load,hasFloors=!!onCreateFloor,hasWalls=!!onCreateWall,hasOpenings=!!onCreateOpening;
  useEffect(()=>{if(open&&!accountOnly&&tab==='account'){void loadCatalog();if(hasFloors)void loadFloors();if(hasWalls)void loadWalls();if(hasOpenings)void loadOpenings();}},[open,accountOnly,tab,loadCatalog,loadFloors,loadWalls,loadOpenings,hasFloors,hasWalls,hasOpenings]);
  const [typeChoice,setTypeChoice]=useState('auto'),[shape,setShape]=useState<FurnitureOutline>('reference');
  const type=resolvedFurnitureType(name,typeChoice);
  const parametersRequired=needsParameterOnly({type,shape});
  const finish=async(item:LibraryItem,run:number)=>{
    if(run!==epoch.current||!latest.current.open)return;
    setSaving(true);
    try { if(account||accountOnly)await catalog.save(item);if(run!==epoch.current)return;onCreate(item);if(accountOnly)notify.success('已保存到账号家具库「'+item.name+'」');pendingRef.current=null;setPending(null);setName('');onOpenChange(false); }
    catch(e){if(run===epoch.current){setError(e instanceof Error?e.message:'保存失败，图片已保留，请重试保存');notify.error('家具「'+item.name+'」保存失败',e);}}
    finally {if(run===epoch.current)setSaving(false);}
  };
  const create=async(parametersOnly=false)=>{
    if(!loggedIn){login();return;}if(lock.current)return;
    const width=parseMeterDraft(w),depth=shape==='circle'?width:parseMeterDraft(d),height=parseMeterDraft(h),amount=price.trim()===''?null:Number(price);
    if(!name.trim()||![width,depth].every(n=>Number.isFinite(n)&&n>=50&&n<=20000)||!Number.isFinite(height)||height<50||height>8000||(amount!==null&&!validPrice(amount))){setError('请填写名称、有效尺寸及非负单价');notify.fail('请填写名称、有效尺寸及非负单价');return;}
    lock.current=true;setError('');const run=epoch.current;
    let item=pendingRef.current||{catalogId:id.current,name:name.trim(),category,type,shape,w:width,d:depth,height,color,price:amount};
    pendingRef.current=item;setPending(item);
    try {
      if(!parametersOnly&&!item.imageUrl){const url=await ai.generate(item);if(run!==epoch.current)return;if(!url)return;item={...item,imageUrl:url};pendingRef.current=item;setPending(item);}
      await finish(item,run);
    }finally {if(run===epoch.current)lock.current=false;}
  };
  const reference=pending||{name,category,type,shape,...appearanceDimensions(shape,parseMeterDraft(w)||1800,parseMeterDraft(d)||800),color};
  const locked=ai.busy||saving||!!pending;
  const dimensions:[string,string,string,(v:string)=>void][]=[shape==='circle'?['直径 m','furniture-width',w,setW]:['宽 m','furniture-width',w,setW],...(shape==='circle'?[]:[['深 m','furniture-depth',d,setD] as [string,string,string,(v:string)=>void]]),['高 m','furniture-height',h,setH]];
  const saveFloor=async(floor:CustomFloor,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await floors.save(floor);
    onCreateFloor?.(floor);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号地面库「'+floor.name+'」');
  };
  const saveWall=async(wall:CustomWall,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await walls.save(wall);
    onCreateWall?.(wall);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号墙面库「'+wall.name+'」');
  };
  const saveOpening=async(opening:CustomOpening,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await openings.save(opening);
    onCreateOpening?.(opening);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号门窗库「'+opening.name+'」');
  };
  const pickMaterial=(add:()=>void)=>{if(!loggedIn)return;add();onOpenChange(false);};
  const accountPanel=<>
    {onCreateFloor&&floors.items.length>0&&<><p className="muted-note">{floors.items.length} 款 · 账号地面</p><div className="account-floor-list">{floors.items.map(f=><button key={f.key} type="button" onClick={()=>{if(!loggedIn)return;onCreateFloor(f);onOpenChange(false);}}><FloorSwatch material={customFloorMaterial(f)}/><span>{f.name}<small>{floorPatterns.find(p=>p.value===f.pattern)?.label} · {f.price===null?'未定价':`¥${f.price}/m²`}</small></span><Plus size={14}/></button>)}</div></>}
    {floors.error&&<p className="form-error">{floors.error}</p>}
    {onCreateWall&&<AccountMaterialList title="账号墙面" items={walls.items.map(w=>({key:w.key,name:w.name,color:w.color,meta:w.price===null?'未定价':`¥${w.price}/m²`,pick:()=>pickMaterial(()=>onCreateWall(w))}))} error={walls.error}/>}
    {onCreateOpening&&<AccountMaterialList title="账号门窗" items={openings.items.map(o=>({key:o.key,name:o.name,kind:o.kind,meta:`${o.kind==='door'?'门':'窗'} · ${o.price===null?'未定价':`¥${o.price}/m²`}`,pick:()=>pickMaterial(()=>onCreateOpening(o))}))} error={openings.error}/>}
    <p className="muted-note">{catalog.count} 款 · 账号目录款式数</p>
    {catalog.error&&<LoadError title="账号家具读取失败" message={catalog.error} retrying={catalog.loading} onRetry={()=>void loadCatalog()}/>}
    <div className="account-furniture-list">{catalog.items.map(i=><button key={i.catalogId} onClick={()=>{if(!loggedIn)return;onImport(i);onOpenChange(false);}}>{i.imageUrl?<img src={i.imageUrl} crossOrigin="anonymous" alt={i.name}/>:<svg viewBox={`${-i.w/2-100} ${-i.d/2-100} ${i.w+200} ${i.d+200}`}><FurnitureShape f={i}/></svg>}<span>{i.name}<small>{i.category} · {i.price===null?'未定价':`¥${i.price}`}</small></span><Plus size={14}/></button>)}</div>
    {catalog.hasMore&&<Button loading={catalog.loading} onClick={()=>void catalog.load(true)}>加载更多</Button>}
    {!catalog.loading&&!catalog.error&&!catalog.items.length&&<p>账号库暂无家具。</p>}
  </>;
  const hardAvailable:Record<string,boolean>={[FLOOR_CATEGORY]:hasFloors,[WALL_CATEGORY]:hasWalls,[OPENING_CATEGORY]:hasOpenings};
  const hardChoices=HARD_CATEGORIES.filter(c=>accountOnly||hardAvailable[c]);
  const categoryField=<div className="custom-field">
    <Label htmlFor="furniture-category">分类</Label>
    <Select value={category} onValueChange={setCategory} disabled={locked}>
      <SelectTrigger id="furniture-category" className="h-9 text-xs"><SelectValue/></SelectTrigger>
      <SelectContent position="popper" className="category-select-content">
        <SelectGroup><SelectLabel>硬装</SelectLabel>{hardChoices.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup>
        <SelectSeparator/>
        <SelectGroup><SelectLabel>软装</SelectLabel>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  </div>;
  const furnitureForm=<form onSubmit={e=>{e.preventDefault();void create(parametersRequired);}}>
    <div className="custom-furniture-layout">
      <fieldset className="custom-furniture-fields" disabled={locked}>
        <div className="custom-field">
          <Label htmlFor="furniture-name">名称</Label>
          <Input id="furniture-name" aria-label="家具名称" maxLength={100} required value={name} disabled={locked} onChange={e=>setName(e.target.value)}/>
        </div>
        {categoryField}
        <div className="custom-field"><Label htmlFor="furniture-type">参考类型</Label><Select value={typeChoice} onValueChange={setTypeChoice} disabled={locked}><SelectTrigger id="furniture-type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">自动匹配 · {furnitureTypes.find(option=>option.value===type)?.label}</SelectItem>{furnitureTypes.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="custom-field"><Label htmlFor="furniture-outline">外形</Label><Select value={shape} onValueChange={value=>setShape(value as FurnitureOutline)} disabled={locked}><SelectTrigger id="furniture-outline"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="reference">参考原形</SelectItem><SelectItem value="rectangle">方形</SelectItem><SelectItem value="circle">圆形</SelectItem></SelectContent></Select></div>
        <div className="custom-dimensions">{dimensions.map(([label,fieldId,value,setter])=><div className="custom-field" key={fieldId}><Label htmlFor={fieldId}>{label}</Label><Input id={fieldId} type="number" step={0.01} min={0.05} max={fieldId==='furniture-height'?8:20} value={value} disabled={locked} onChange={e=>setter(e.target.value)}/></div>)}</div>
        <div className="custom-field">
          <Label htmlFor="furniture-price">价格 / 元每件</Label>
          <Input id="furniture-price" type="number" min={0} placeholder="未定价" value={price} disabled={locked} onChange={e=>setPrice(e.target.value)}/>
        </div>
        <ColorPickerField label="模型颜色" value={color} onChange={setColor} disabled={locked}/>
      </fieldset>
      <div className="custom-image-panel">
        <div className="custom-image-preview">{pending?.imageUrl||ai.image?<img src={pending?.imageUrl||ai.image} crossOrigin="anonymous" alt="家具生成外观"/>:ai.busy?<><Loader2 className="animate-spin"/><span>正在生成统一风格外观…</span></>:<><svg viewBox={`${-reference.w/2-100} ${-reference.d/2-100} ${reference.w+200} ${reference.d+200}`}><FurnitureShape f={reference}/></svg><span>{parametersRequired?'参考几何预览':'参考符号 · 创建时生成外观图'}</span></>}</div>
        <small>{parametersRequired?'此类型或外形先保存参考几何，不生成图片、不消耗 AI 额度。':'生成可能消耗 AI 额度；每次创建只提交一次，不随字段修改生成。'}</small>
        {ai.error&&<p className="form-error" role="alert">{ai.error}</p>}
      </div>
    </div>
    {!accountOnly&&<div className="account-catalog-option"><Checkbox id="furniture-account" checked={account} disabled={locked} onCheckedChange={v=>setAccount(v===true)}/><Label htmlFor="furniture-account" className="text-[11px]">同时添加到账号家具库</Label></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {pending&&!ai.busy&&!saving&&<div className="visual-form-actions">{!pending.imageUrl&&<Button type="button" variant="outline" onClick={()=>void create(true)}>仅保存家具参数</Button>}<Button type="button" variant="ghost" onClick={()=>{pendingRef.current=null;setPending(null);cancel();id.current=uid();}}>返回修改参数</Button></div>}
    <div className="visual-form-actions"><Button type="button" variant="ghost" onClick={()=>onOpenChange(false)}>取消</Button><Button type="submit" disabled={ai.busy||saving}><Plus/>{saving?'正在保存…':pending?.imageUrl?'重试保存（不重新生成）':pending?'重试保存':parametersRequired?'仅保存家具参数':'创建家具'}</Button></div>
  </form>;
  const formProps={categoryField,accountOnly,onCancel:()=>onOpenChange(false)};
  const createForm=category===FLOOR_CATEGORY?<CustomFloorForm {...formProps} onSave={saveFloor}/>:category===WALL_CATEGORY?<CustomWallForm {...formProps} onSave={saveWall}/>:category===OPENING_CATEGORY?<CustomOpeningForm {...formProps} onSave={saveOpening}/>:furnitureForm;
  const title=HARD_CATEGORIES.includes(category)?'新建'+category:'新建你的家具';
  const description=category===FLOOR_CATEGORY?'按铺贴样式与尺寸绘制纹理，可在房间材质中选用。':category===WALL_CATEGORY?'设置墙面颜色与单价，可在房间材质中选用。':category===OPENING_CATEGORY?'设置门窗尺寸与单价，选中画布中的门窗即可切换款式。':'参考类型可按名称匹配或手动选择；画布按参考几何绘制，生成图不代表精确3D建模。';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="custom-furniture-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{accountOnly?'保存到账号家具库，可在各项目中使用。':'默认保存当前项目，可选同时加入账号库。'}{description}</DialogDescription></DialogHeader>
  {accountOnly?createForm:<Tabs value={tab} onValueChange={setTab}><TabsList className="project-tabs"><TabsTrigger value="create" className={tabTrigger}><Plus size={14}/>新建家具</TabsTrigger><TabsTrigger value="account" className={tabTrigger}><Cloud size={14}/>账号家具库</TabsTrigger></TabsList><TabsContent value="create">{createForm}</TabsContent><TabsContent value="account">{accountPanel}</TabsContent></Tabs>}
  </DialogContent></Dialog>;
}
