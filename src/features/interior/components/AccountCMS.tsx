import { useEffect, useState } from 'react';
import { FolderOpen,Armchair,Wallet,LogOut,LayoutTemplate } from 'lucide-react';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { ProjectManager } from './ProjectManager';
import { AccountCostManager } from './AccountCostManager';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { Button } from '@/components/ui/button';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
export function AccountCMS({projects,costs,opened}:{projects:ReturnType<typeof useProjects>;costs:ReturnType<typeof useAccountCosts>;opened:()=>void}){
  const [tab,setTab]=useState('projects'),[creating,setCreating]=useState(false),[dirty,setDirty]=useState(false),[leaving,setLeaving]=useState<string|null>(null);
  const navigate=(next:string)=>{if(next===tab)return;if(dirty){setLeaving(next);return;}if(next==='logout')void projects.signOut();else setTab(next);};
  const catalog=useFurnitureCatalog(),load=catalog.load,reset=catalog.reset;
  useEffect(()=>{if(tab!=='projects')void load();return reset;},[tab,load,reset]);
  const modules=[{id:'projects',name:'项目管理',icon:FolderOpen},{id:'furniture',name:'家具管理',icon:Armchair},{id:'costs',name:'成本管理',icon:Wallet}];
  return <div className="account-cms"><aside className="cms-sidebar"><div className="cms-brand"><LayoutTemplate/><b>筑间 STUDIO</b><small>我的设计工作室</small></div><nav aria-label="管理模块">{modules.map(m=><button key={m.id} className={tab===m.id?'active':''} onClick={()=>navigate(m.id)}><m.icon size={19}/>{m.name}</button>)}</nav><div className="cms-account"><small>{projects.session?.user.email}</small><button onClick={()=>navigate('logout')}><LogOut size={16}/>退出登录</button></div></aside><main className="cms-main">
    {tab==='projects'?<ProjectManager projects={projects} opened={opened}/>:tab==='costs'?(costs.loading?<p role="status">正在读取账号成本…</p>:<AccountCostManager onDirty={setDirty} key={projects.session?.user.id} settings={costs.settings} save={costs.save} saving={costs.saving} error={costs.error} items={catalog.items}/>):<AccountFurnitureLibrary catalog={catalog} defaults={costs.settings} onNew={()=>setCreating(true)}/>}
  {tab==='costs'&&catalog.hasMore&&<Button variant="outline" disabled={catalog.loading} onClick={()=>void load(true)}>加载更多账号家具款式</Button>}
  </main><AlertDialog open={!!leaving} onOpenChange={v=>{if(!v)setLeaving(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>账号成本尚未保存</AlertDialogTitle><AlertDialogDescription>继续编辑可保留草稿；离开将丢弃未保存的账号调价，已有项目数据不变。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={()=>{setDirty(false);if(leaving==='logout')void projects.signOut();else if(leaving)setTab(leaving);setLeaving(null);}}>放弃更改并离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{creating&&<CustomFurnitureDialog open={creating} onOpenChange={setCreating} loggedIn={true} login={()=>{}} ownerKey={projects.session!.user.id} accountOnly onCreate={()=>{void load();}} onImport={()=>{}}/>}</div>;
}
