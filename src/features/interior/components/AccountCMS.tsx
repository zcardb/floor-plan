import { useCallback,useState } from 'react';
import { FolderOpen,Armchair,Bot } from 'lucide-react';
import { CmsLayout, CmsSidebar, type CmsModule } from './CmsLayout';
import { AssistantManager } from './AssistantManager';
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
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import type { PendingLeave } from './useStudioRoute';
const SIDEBAR_KEY='cms-sidebar-collapsed';
const MODULES:CmsModule[]=[{id:'projects',name:'项目管理',icon:FolderOpen},{id:'furniture',name:'家具管理',icon:Armchair},{id:'assistants',name:'小助手',icon:Bot}];
/** 侧边栏当前项来自路由（tab），切换时只通知上层改地址；未保存确认框同时服务「退出登录」和被拦下的跳转。 */
export function AccountCMS({projects,costs,opened,tab,onTab,onDirty,pendingLeave=null}:{projects:ReturnType<typeof useProjects>;costs:ReturnType<typeof useAccountCosts>;opened:()=>void;tab:string;onTab:(tab:string)=>void;onDirty?:(dirty:boolean)=>void;pendingLeave?:PendingLeave|null}){
  const [creating,setCreating]=useState(false),[dirty,setDirtyState]=useState(false),[leaving,setLeaving]=useState<string|null>(null);
  // 侧栏收起为图标栏（仅桌面端生效），选择记在本机。
  const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(SIDEBAR_KEY)==='1';}catch{return false;}});
  const toggleSidebar=()=>setCollapsed(c=>{try{localStorage.setItem(SIDEBAR_KEY,c?'0':'1');}catch{/* 存储不可用时只在本次会话生效 */}return !c;});
  const setDirty=(next:boolean)=>{setDirtyState(next);onDirty?.(next);};
  // 换页面的未保存拦截交给路由守卫（浏览器后退也走那里）；退出登录不改地址，在这里拦。
  const navigate=(next:string)=>{if(next===tab||costs.saving)return;if(next!=='logout'){onTab(next);return;}if(dirty){setLeaving(next);return;}void projects.signOut();};
  const cancelLeave=()=>{setLeaving(null);pendingLeave?.reset();};
  const confirmLeave=()=>{setDirty(false);if(leaving==='logout')void projects.signOut();pendingLeave?.proceed();setLeaving(null);};
  const catalog=useFurnitureCatalog(),load=catalog.load,reset=catalog.reset,floors=useFloorCatalog(),loadFloors=floors.load,walls=useWallCatalog(),loadWalls=walls.load,openings=useOpeningCatalog(),loadOpenings=openings.load,roofs=useRoofCatalog(),loadRoofs=roofs.load,ceilings=useCeilingCatalog(),loadCeilings=ceilings.load;
  const loadAll=useCallback(async()=>{await Promise.all([load(),loadFloors(),loadWalls(),loadOpenings(),loadRoofs(),loadCeilings()]);},[load,loadFloors,loadWalls,loadOpenings,loadRoofs,loadCeilings]);
  const materialError=floors.error||walls.error||openings.error||roofs.error||ceilings.error;
  const [initialCategory,setInitialCategory]=useState('客厅');
  const newFurniture=(category:string)=>{setInitialCategory(newFurnitureCategory(category));setCreating(true);};
  return <CmsLayout collapsed={collapsed} sidebar={<CmsSidebar collapsed={collapsed} onToggle={toggleSidebar} modules={MODULES} active={tab} onSelect={navigate} email={projects.session?.user.email??''} loggingOut={projects.signingOut} onLogout={()=>navigate('logout')}/>} after={<>
    <AlertDialog open={!!leaving||!!pendingLeave} onOpenChange={v=>{if(!v)cancelLeave();}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>账号单价尚未保存</AlertDialogTitle><AlertDialogDescription>继续编辑可保留草稿；离开将丢弃未保存的账号调价，已有项目数据不变。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={confirmLeave}>放弃更改并离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {creating&&<CustomFurnitureDialog open={creating} onOpenChange={setCreating} loggedIn={true} login={()=>{}} ownerKey={projects.session!.user.id} accountOnly initialCategory={initialCategory} onCreate={()=>{void load();}} onCreateFloor={()=>{void loadFloors();}} onCreateWall={()=>{void loadWalls();}} onCreateOpening={()=>{void loadOpenings();}} onCreateRoof={()=>{void loadRoofs();}} onCreateCeiling={()=>{void loadCeilings();}} onImport={()=>{}}/>}
  </>}>
    {tab==='assistants'?<AssistantManager key={projects.session?.user.id}/>:<ManagementEntry key={tab} label={tab==='projects'?'加载项目':'加载家具'} variant={tab==='projects'?'projects':'library'} loading={tab==='projects'?!projects.listReady||projects.loading:costs.loading||catalog.loading||floors.loading||walls.loading||openings.loading||roofs.loading||ceilings.loading} load={tab==='projects'?undefined:loadAll} reset={tab==='projects'?undefined:reset}>
      {tab==='projects'?<ProjectManager projects={projects} opened={opened}/>:<AccountFurnitureLibrary key={projects.session?.user.id} catalog={catalog} floors={floors.items} walls={walls.items} openings={openings.items} roofs={roofs.items} ceilings={ceilings.items} defaults={costs.settings} saveDefaults={costs.save} saving={costs.saving} saveError={costs.error} onDirty={setDirty} onNew={newFurniture} loadError={materialError} reload={()=>void loadAll()} materialSaves={{floor:floors.save,opening:openings.save,wall:walls.save,roof:roofs.save,ceiling:ceilings.save}} reloadMaterial={kind=>void({floor:loadFloors,opening:loadOpenings,wall:loadWalls,roof:loadRoofs,ceiling:loadCeilings}[kind])()}/>}
    </ManagementEntry>}
  </CmsLayout>;
}
