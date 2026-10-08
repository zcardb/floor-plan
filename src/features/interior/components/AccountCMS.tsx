import { useCallback,useState } from 'react';
import { FolderOpen,Armchair,LogOut,LayoutTemplate,Loader2 } from 'lucide-react';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { useFloorCatalog } from '../cloud/useFloorCatalog';
import { useWallCatalog } from '../cloud/useWallCatalog';
import { useOpeningCatalog } from '../cloud/useOpeningCatalog';
import { useCeilingCatalog, useRoofCatalog } from '../cloud/useSurfaceCatalogs';
import { ProjectManager } from './ProjectManager';
import { ManagementEntry } from './ManagementEntry';
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { AccountAvatar } from './AccountAvatar';
import { Popover,PopoverTrigger,PopoverContent } from '@/components/ui/popover';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Button } from '@/components/ui/button';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
export function AccountCMS({projects,costs,opened}:{projects:ReturnType<typeof useProjects>;costs:ReturnType<typeof useAccountCosts>;opened:()=>void}){
  const [tab,setTab]=useState('projects'),[creating,setCreating]=useState(false),[dirty,setDirty]=useState(false),[leaving,setLeaving]=useState<string|null>(null),[accountOpen,setAccountOpen]=useState(false);
  const navigate=(next:string)=>{if(next===tab||costs.saving)return;if(dirty){setLeaving(next);return;}if(next==='logout')void projects.signOut();else setTab(next);};
  const email=projects.session?.user.email??'',at=email.indexOf('@'),nameHead=at<0?email:email.slice(0,at),nameTail=at<0?'':email.slice(at);
  const catalog=useFurnitureCatalog(),load=catalog.load,reset=catalog.reset,floors=useFloorCatalog(),loadFloors=floors.load,walls=useWallCatalog(),loadWalls=walls.load,openings=useOpeningCatalog(),loadOpenings=openings.load,roofs=useRoofCatalog(),loadRoofs=roofs.load,ceilings=useCeilingCatalog(),loadCeilings=ceilings.load;
  const loadAll=useCallback(async()=>{await Promise.all([load(),loadFloors(),loadWalls(),loadOpenings(),loadRoofs(),loadCeilings()]);},[load,loadFloors,loadWalls,loadOpenings,loadRoofs,loadCeilings]);
  const materialError=floors.error||walls.error||openings.error||roofs.error||ceilings.error;
  const [initialCategory,setInitialCategory]=useState('客厅');
  const newFurniture=(category:string)=>{setInitialCategory(newFurnitureCategory(category));setCreating(true);};
  const modules=[{id:'projects',name:'项目管理',icon:FolderOpen},{id:'furniture',name:'家具管理',icon:Armchair}];
  return <div className="account-cms"><aside className="cms-sidebar"><div className="cms-brand"><LayoutTemplate/><b>筑间 STUDIO</b><small>我的设计工作室</small></div><nav aria-label="管理模块">{modules.map(m=><EditorTooltip key={m.id} label={m.name} side="right"><button className={tab===m.id?'active':''} onClick={()=>navigate(m.id)}><m.icon size={19}/>{m.name}</button></EditorTooltip>)}</nav><div className="cms-account"><Popover open={accountOpen} onOpenChange={setAccountOpen}><EditorTooltip label="账号" side="right"><PopoverTrigger asChild><button type="button" className="cms-account-trigger" aria-label={`账号菜单：${email}`}><AccountAvatar email={projects.session?.user.email} size={28}/><span className="cms-account-name"><b>{nameHead}</b><span>{nameTail}</span></span></button></PopoverTrigger></EditorTooltip><PopoverContent className="account-popover" side="top" align="start" sideOffset={10}><div className="account-popover-head"><AccountAvatar email={projects.session?.user.email} size={52}/><b>{projects.session?.user.email}</b><small>已登录 · 云端同步</small></div><span className="account-popover-sep" aria-hidden="true"/><EditorTooltip label="退出登录" side="right" disabled={projects.signingOut}><button type="button" className="account-popover-logout" disabled={projects.signingOut} aria-busy={projects.signingOut} onClick={()=>{setAccountOpen(false);navigate('logout');}}>{projects.signingOut?<Loader2 className="animate-spin" size={16}/>:<LogOut size={16}/>}退出登录</button></EditorTooltip></PopoverContent></Popover></div></aside><main className="cms-main">
    <ManagementEntry key={tab} label={tab==='projects'?'加载项目':'加载家具'} variant={tab==='projects'?'cards':'library'} loading={tab==='projects'?!projects.listReady||projects.loading:costs.loading||catalog.loading||floors.loading||walls.loading||openings.loading||roofs.loading||ceilings.loading} load={tab==='projects'?undefined:loadAll} reset={tab==='projects'?undefined:reset}>
      {tab==='projects'?<ProjectManager projects={projects} opened={opened}/>:<AccountFurnitureLibrary key={projects.session?.user.id} catalog={catalog} floors={floors.items} walls={walls.items} openings={openings.items} roofs={roofs.items} ceilings={ceilings.items} defaults={costs.settings} saveDefaults={costs.save} saving={costs.saving} saveError={costs.error} onDirty={setDirty} onNew={newFurniture} loadError={materialError} reload={()=>void loadAll()}/>}
    </ManagementEntry>
  </main><AlertDialog open={!!leaving} onOpenChange={v=>{if(!v)setLeaving(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>账号单价尚未保存</AlertDialogTitle><AlertDialogDescription>继续编辑可保留草稿；离开将丢弃未保存的账号调价，已有项目数据不变。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={()=>{setDirty(false);if(leaving==='logout')void projects.signOut();else if(leaving)setTab(leaving);setLeaving(null);}}>放弃更改并离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{creating&&<CustomFurnitureDialog open={creating} onOpenChange={setCreating} loggedIn={true} login={()=>{}} ownerKey={projects.session!.user.id} accountOnly initialCategory={initialCategory} onCreate={()=>{void load();}} onCreateFloor={()=>{void loadFloors();}} onCreateWall={()=>{void loadWalls();}} onCreateOpening={()=>{void loadOpenings();}} onCreateRoof={()=>{void loadRoofs();}} onCreateCeiling={()=>{void loadCeilings();}} onImport={()=>{}}/>}</div>;
}
