import { useEffect, useRef, useState } from 'react';
import { useProjects } from '@/features/interior/cloud/useProjects';
import { useAccountCosts } from '@/features/interior/cloud/useAccountCosts';
import { Workbench } from '@/features/interior/components/Workbench';
import { AuthDialog } from '@/features/interior/components/AuthDialog';
import { AccountCMS } from '@/features/interior/components/AccountCMS';
import { CostDefaultsContext } from '@/features/interior/components/CostDefaultsContext';
import { ManagementLoading } from '@/features/interior/components/ManagementLoading';
const Index=()=>{
  const projects=useProjects(),costs=useAccountCosts(projects.session?.user.id);
  const [authOpen,setAuthOpen]=useState(false),[authIntent,setAuthIntent]=useState<'cloud'|null>(null),[editingOwner,setEditingOwner]=useState<string|null>(null);
  const pendingCloud=useRef(false),guestSave=useRef(projects.saveGuestToCloud);
  guestSave.current=projects.saveGuestToCloud;
  const owner=projects.session?.user.id, editing=owner&&editingOwner===owner;
  const manage=async()=>{if(await projects.save())setEditingOwner(null);};
  const login=()=>{setAuthIntent(null);setAuthOpen(true);};
  // 游客顶部的「登录并保存到云端」：先记下意图，登录成功后转存并直接进入该项目。
  const cloudSave=async()=>{if(owner)return false;pendingCloud.current=true;setAuthIntent('cloud');setAuthOpen(true);return false;};
  useEffect(()=>{if(!owner||!pendingCloud.current)return;pendingCloud.current=false;void guestSave.current().then(ok=>{if(ok)setEditingOwner(owner);});},[owner]);
  if(!projects.ready)return <div className="studio-restoring"><ManagementLoading heading label="恢复工作室" /></div>;
  return <CostDefaultsContext.Provider value={owner?costs.settings:{}}>{owner&&!editing?<AccountCMS key={owner} projects={projects} costs={costs} opened={()=>setEditingOwner(owner)}/>:projects.active?<Workbench key={(owner||'guest')+projects.active.id} project={projects.active} projectNavigation={{projectList:[...projects.guests,...projects.cloud],hasMore:projects.hasMore,listLoading:projects.loading,onOpen:projects.open,onLoadMore:()=>void projects.loadMore()}} update={projects.update} status={projects.status} loggedIn={!!owner} email={projects.session?.user.email} projects={()=>void manage()} login={login} logout={()=>{setEditingOwner(null);void projects.signOut();}} loggingOut={projects.signingOut} cloudSave={cloudSave} guestEdits={projects.guestEdits}/>:null}<AuthDialog open={authOpen} intent={authIntent} onOpenChange={v=>{setAuthOpen(v);if(!v)setAuthIntent(null);}}/></CostDefaultsContext.Provider>;
};
export default Index;
