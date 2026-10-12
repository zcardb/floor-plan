import { useEffect,useRef,useState } from 'react';
import { Plus,Loader2,Cloud } from 'lucide-react';
import { LoadError } from './LoadError';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select,SelectContent,SelectGroup,SelectItem,SelectLabel,SelectSeparator,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { categories } from '../data/catalog';
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { uid,type CustomFloor,type CustomOpening,type CustomWall,type LibraryItem } from '../model/types';
import { FLOOR_CATEGORY,customFloorMaterial,floorPatterns } from '../model/floorMaterials';
import { useAccountLibrary } from '../cloud/useAccountLibrary';
import { accountMaterialSaves, saveAccountFurniture } from '../cloud/accountWrites';
import { HARD_CATEGORIES,OPENING_CATEGORY,openingKindLabel,surfaceCategory,surfaceKindOfCategory,type SurfaceKind } from '../model/hardMaterials';
import { CustomColorMaterialForm } from './CustomColorMaterialForm';
import { CustomOpeningForm } from './CustomOpeningForm';
import { AccountMaterialList } from './AccountMaterialList';
import { CustomFloorForm } from './CustomFloorForm';
import { FloorSwatch } from './FloorSwatch';
import { useFurnitureImage } from '../cloud/useFurnitureImage';
import { FurnitureShape } from './FurnitureShape';
import { needsParameterOnly } from '../model/furnitureAppearance';
import { emptyFurnitureDraft, parseFurnitureDraft, previewFurnitureDraft, FURNITURE_DRAFT_ERROR, type FurnitureDraft } from '../model/furnitureDraft';
import { FurnitureFormFields } from './FurnitureFormFields';
import { notify } from '@/lib/notify';
type Props = { open:boolean; onOpenChange:(v:boolean)=>void; loggedIn:boolean; login:()=>void; onCreate:(i:LibraryItem)=>void; onImport:(i:LibraryItem)=>void; onCreateFloor?:(f:CustomFloor)=>void; onCreateWall?:(w:CustomWall)=>void; onCreateOpening?:(o:CustomOpening)=>void; onCreateRoof?:(r:CustomWall)=>void; onCreateCeiling?:(c:CustomWall)=>void; ownerKey:string; accountOnly?:boolean; initialCategory?:string };
const tabTrigger = 'gap-[5px] rounded px-2.5 py-1.5 text-[11px] max-[700px]:px-[7px] max-[700px]:text-[10px]';
const surfaceDescription:Record<SurfaceKind,string>={wall:'设置墙面颜色与单价，可在房间材质中选用。',roof:'设置屋面颜色与单价，可在房间材质中选用并设置坡度。',ceiling:'设置吊顶颜色与单价，可在房间材质中选用。'};
export function CustomFurnitureDialog({open,onOpenChange,loggedIn,login,onCreate,onImport,onCreateFloor,onCreateWall,onCreateOpening,onCreateRoof,onCreateCeiling,ownerKey,accountOnly=false,initialCategory='客厅'}:Props){
  const [draft,setDraft]=useState<FurnitureDraft>(()=>emptyFurnitureDraft(newFurnitureCategory(initialCategory))),[account,setAccount]=useState(accountOnly),[error,setError]=useState(''),[saving,setSaving]=useState(false),[tab,setTab]=useState('create'),[pending,setPending]=useState<LibraryItem|null>(null);
  // 账号库一次读完：家具与地面 / 墙面 / 门窗 / 屋面 / 吊顶在同一个列表里。
  const accountSaveFurniture=saveAccountFurniture,ai=useFurnitureImage(),accountLib=useAccountLibrary(),cancel=ai.cancel,reset=accountLib.reset;
  const epoch=useRef(0),lock=useRef(false),id=useRef(uid()),pendingRef=useRef<LibraryItem|null>(null),latest=useRef({open,ownerKey}); latest.current={open,ownerKey};
  useEffect(()=>{const generation=epoch;epoch.current++;lock.current=false;pendingRef.current=null;setPending(null);setSaving(false);setError('');cancel();reset();id.current=uid();return()=>{generation.current++;};},[open,ownerKey,cancel,reset]);
  const loadAccount=accountLib.load,cat=accountLib.furniture,floors=accountLib.floors,walls=accountLib.walls,openings=accountLib.openings,roofs=accountLib.roofs,ceilings=accountLib.ceilings,hasFloors=!!onCreateFloor,hasWalls=!!onCreateWall,hasOpenings=!!onCreateOpening,hasRoofs=!!onCreateRoof,hasCeilings=!!onCreateCeiling;
  useEffect(()=>{if(open&&!accountOnly&&tab==='account')void loadAccount();},[open,accountOnly,tab,loadAccount]);
  const category=draft.category,patch=(next:Partial<FurnitureDraft>)=>setDraft(current=>({...current,...next})),setCategory=(value:string)=>patch({category:value});
  const parametersRequired=needsParameterOnly(previewFurnitureDraft(draft));
  const finish=async(item:LibraryItem,run:number)=>{
    if(run!==epoch.current||!latest.current.open)return;
    setSaving(true);
    try { if(account||accountOnly)await accountSaveFurniture(item);if(run!==epoch.current)return;onCreate(item);if(accountOnly)notify.success('已保存到账号家具库「'+item.name+'」');pendingRef.current=null;setPending(null);patch({name:''});onOpenChange(false); }
    catch(e){if(run===epoch.current){setError(e instanceof Error?e.message:'保存失败，图片已保留，请重试保存');notify.error('家具「'+item.name+'」保存失败',e);}}
    finally {if(run===epoch.current)setSaving(false);}
  };
  const create=async(parametersOnly=false)=>{
    if(!loggedIn){login();return;}if(lock.current)return;
    const parsed=parseFurnitureDraft(draft);
    if(!parsed){setError(FURNITURE_DRAFT_ERROR);notify.fail(FURNITURE_DRAFT_ERROR);return;}
    lock.current=true;setError('');const run=epoch.current;
    let item:LibraryItem=pendingRef.current||{catalogId:id.current,...parsed};
    pendingRef.current=item;setPending(item);
    try {
      if(!parametersOnly&&!item.imageUrl){const url=await ai.generate(item);if(run!==epoch.current)return;if(!url)return;item={...item,imageUrl:url};pendingRef.current=item;setPending(item);}
      await finish(item,run);
    }finally {if(run===epoch.current)lock.current=false;}
  };
  const reference=pending||previewFurnitureDraft(draft);
  const locked=ai.busy||saving||!!pending;
  const saveFloor=async(floor:CustomFloor,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await accountMaterialSaves.floor(floor);
    onCreateFloor?.(floor);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号地面库「'+floor.name+'」');
  };
  const surfaceStores={wall:{items:walls,create:onCreateWall},roof:{items:roofs,create:onCreateRoof},ceiling:{items:ceilings,create:onCreateCeiling}};
  const saveSurface=(kind:SurfaceKind)=>async(item:CustomWall,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await accountMaterialSaves[kind](item);
    surfaceStores[kind].create?.(item);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号'+surfaceCategory(kind)+'库「'+item.name+'」');
  };
  const saveOpening=async(opening:CustomOpening,toAccount:boolean)=>{
    if(!loggedIn){login();return;}
    if(toAccount)await accountMaterialSaves.opening(opening);
    onCreateOpening?.(opening);onOpenChange(false);
    if(accountOnly)notify.success('已保存到账号门窗库「'+opening.name+'」');
  };
  const pickMaterial=(add:()=>void)=>{if(!loggedIn)return;add();onOpenChange(false);};
  const accountPanel=<>
    {onCreateFloor&&floors.length>0&&<><p className="muted-note">{floors.length} 款 · 账号地面</p><div className="account-floor-list">{floors.map(f=><button key={f.key} type="button" onClick={()=>{if(!loggedIn)return;onCreateFloor(f);onOpenChange(false);}}><FloorSwatch material={customFloorMaterial(f)}/><span>{f.name}<small>{floorPatterns.find(p=>p.value===f.pattern)?.label} · {f.price===null?'未定价':`¥${f.price}/m²`}</small></span><Plus size={14}/></button>)}</div></>}
    {(['wall','roof','ceiling'] as const).map(kind=>{const store=surfaceStores[kind],create=store.create;return create&&<AccountMaterialList key={kind} title={'账号'+surfaceCategory(kind)} items={store.items.map(w=>({key:w.key,name:w.name,color:w.color,meta:w.price===null?'未定价':`¥${w.price}/m²`,pick:()=>pickMaterial(()=>create(w))}))}/>;})}
    {onCreateOpening&&<AccountMaterialList title="账号门窗" items={openings.map(o=>({key:o.key,name:o.name,kind:o.kind,meta:`${openingKindLabel(o.kind)} · ${o.price===null?'未定价':`¥${o.price}/m²`}`,pick:()=>pickMaterial(()=>onCreateOpening(o))}))}/>}
    {accountLib.error&&<LoadError title="账号库读取失败" message={accountLib.error} retrying={accountLib.loading} onRetry={()=>void loadAccount()}/>}
    <div className="account-furniture-list">{cat.map(i=><button key={i.catalogId} onClick={()=>{if(!loggedIn)return;onImport(i);onOpenChange(false);}}>{i.imageUrl?<img src={i.imageUrl} crossOrigin="anonymous" alt={i.name}/>:<svg viewBox={`${-i.w/2-100} ${-i.d/2-100} ${i.w+200} ${i.d+200}`}><FurnitureShape f={i}/></svg>}<span>{i.name}<small>{i.category} · {i.price===null?'未定价':`¥${i.price}`}</small></span><Plus size={14}/></button>)}</div>
    {!accountLib.loading&&!accountLib.error&&!cat.length&&<p>账号库暂无家具。</p>}
  </>;
  const hardAvailable:Record<string,boolean>={[FLOOR_CATEGORY]:hasFloors,[surfaceCategory('wall')]:hasWalls,[OPENING_CATEGORY]:hasOpenings,[surfaceCategory('roof')]:hasRoofs,[surfaceCategory('ceiling')]:hasCeilings};
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
      <FurnitureFormFields draft={draft} onChange={patch} categoryField={categoryField} disabled={locked}/>
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
  const surfaceKind=surfaceKindOfCategory(category);
  const createForm=category===FLOOR_CATEGORY?<CustomFloorForm {...formProps} onSave={saveFloor}/>:surfaceKind?<CustomColorMaterialForm key={surfaceKind} kind={surfaceKind} {...formProps} onSave={saveSurface(surfaceKind)}/>:category===OPENING_CATEGORY?<CustomOpeningForm {...formProps} onSave={saveOpening}/>:furnitureForm;
  const title=HARD_CATEGORIES.includes(category)?'新建'+category:'新建你的家具';
  const description=category===FLOOR_CATEGORY?'按铺贴样式与尺寸绘制纹理，可在房间材质中选用。':surfaceKind?surfaceDescription[surfaceKind]:category===OPENING_CATEGORY?'设置门窗尺寸与单价，选中画布中的门窗即可切换款式。':'参考类型可按名称匹配或手动选择；画布按参考几何绘制，生成图不代表精确3D建模。';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="custom-furniture-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{accountOnly?'保存到账号家具库，可在各项目中使用。':'默认保存当前项目，可选同时加入账号库。'}{description}</DialogDescription></DialogHeader>
  {accountOnly?createForm:<Tabs value={tab} onValueChange={setTab}><TabsList className="project-tabs"><TabsTrigger value="create" className={tabTrigger}><Plus size={14}/>新建家具</TabsTrigger><TabsTrigger value="account" className={tabTrigger}><Cloud size={14}/>账号家具库</TabsTrigger></TabsList><TabsContent value="create">{createForm}</TabsContent><TabsContent value="account">{accountPanel}</TabsContent></Tabs>}
  </DialogContent></Dialog>;
}
