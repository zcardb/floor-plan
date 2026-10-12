import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { projectPage, type ProjectSummary, useProjects } from '@/features/projects';
import type { PageSource } from '@/lib/paging';
import { useAccountCosts } from '@/contexts/account-costs/use-account-costs';
import { Workbench } from '@/features/editor';
import { AccountCostSaveContext, CostDefaultsContext } from '@/contexts/account-costs/cost-defaults-context';
import { useStudioRoute } from '../hooks/use-studio-route';
import { createProject } from '@/lib/floor-plan/templates';
import { isBuiltinId } from '@/lib/floor-plan/template-presets';
import { PROJECTS_PATH, cmsPath, stylePath } from '../routes';
import { notify } from '@/lib/notify';
import { AuthDialog } from '@/features/account';
import { ManagementLoading } from '@/components/cms/management-loading';
/** 工作台「切换项目」菜单用的云端项目列表：只要名称与时间，不带缩略图。 */
const menuProjects:PageSource<ProjectSummary>=request=>projectPage(request,{thumbnails:false});
// 首屏默认是 2D 工作台：账号管理外壳按需下载（各管理页再由所属 Feature 按需下载），登录弹窗由账号 Feature 按需下载，都不进首屏包。
const AccountCMS=lazy(()=>import('../account-cms/account-cms').then(m=>({default:m.AccountCMS})));
// 所有页面级路由共用这一个实例：会话、自动保存和当前项目都挂在 useProjects 上，换地址不能把它卸载。
const StudioPage=()=>{
  const projects=useProjects(),costs=useAccountCosts(projects.session?.user.id);
  const [authOpen,setAuthOpenState]=useState(false),[authMounted,setAuthMounted]=useState(false),[authIntent,setAuthIntent]=useState<'cloud'|null>(null),[cmsDirty,setCmsDirty]=useState(false);
  const route=useStudioRoute(projects,cmsDirty),view=route.view,goToActive=route.goToActive;
  // 登录弹窗第一次打开后才挂载，之后保持挂载以保留关闭动画。
  const setAuthOpen=(open:boolean)=>{if(open)setAuthMounted(true);setAuthOpenState(open);};
  const pendingCloud=useRef(false),guestSave=useRef(projects.saveGuestToCloud);
  guestSave.current=projects.saveGuestToCloud;
  const owner=projects.session?.user.id;
  // 打开 / 新建 / 复制成功后把地址切到该项目；游客只有一份本机草稿，始终停在首页。
  const entered=(ok:boolean)=>{if(ok&&owner)goToActive();return ok;};
  const manage=async()=>{if(await projects.save())route.goTo(PROJECTS_PATH);};
  // 工作台里删掉正在编辑的项目后，回到项目管理，而不是落到别的方案上。
  // 复制当前项目并进入副本：内置模板走「用模板新建」，自己的项目走复制。
  const duplicateProject=async(row:ProjectSummary)=>{
    if(!row.builtin&&!isBuiltinId(row.id))return entered(await projects.duplicate(row));
    const name=row.name+' · 副本',ok=await projects.create(createProject(row.templateId??'reference',name),true);
    if(ok)notify.success('已复制为「'+name+'」');
    return entered(ok);
  };
  const login=()=>{setAuthIntent(null);setAuthOpen(true);};
  // 游客顶部的「登录并保存到云端」：先记下意图，登录成功后转存并直接进入该项目。
  const cloudSave=async()=>{if(owner)return false;pendingCloud.current=true;setAuthIntent('cloud');setAuthOpen(true);return false;};
  useEffect(()=>{if(!owner||!pendingCloud.current)return;pendingCloud.current=false;void guestSave.current().then(ok=>{if(ok)goToActive();});},[owner,goToActive]);
  const loading=(label:string)=><div className="studio-restoring"><ManagementLoading heading label={label} /></div>;
  if(!projects.ready)return loading('恢复工作室');
  const workbench=view.kind==='guest'||route.projectReady;
  return <CostDefaultsContext.Provider value={owner?costs.settings:{}}><AccountCostSaveContext.Provider value={owner?costs.save:null}>{view.kind==='cms'?<Suspense fallback={loading('加载内容')}><AccountCMS key={owner} projects={projects} costs={costs} tab={view.tab} styleId={view.styleId} onTab={tab=>route.goTo(cmsPath(tab))} onStyle={id=>route.goTo(id?stylePath(id):cmsPath('styles'))} onDirty={setCmsDirty} pendingLeave={route.pendingLeave} opened={goToActive}/></Suspense>:!workbench?loading(view.kind==='project'?'打开项目':'恢复工作室'):projects.active?<Workbench key={(owner||'guest')+projects.active.id} project={projects.active} projectNavigation={{cloudProjects:owner?menuProjects:undefined,localProjects:owner?[...projects.guests,...projects.builtins]:projects.builtins,onOpen:async row=>entered(await projects.open(row)),onCreateProject:owner?async project=>entered(await projects.create(project,true)):undefined,onDuplicate:owner?duplicateProject:undefined}} createFromTemplate={async id=>entered(await projects.create(createProject(id),true))} update={projects.update} status={projects.status} loggedIn={!!owner} email={projects.session?.user.email} projects={()=>void manage()} login={login} logout={()=>void projects.signOut()} loggingOut={projects.signingOut} cloudSave={cloudSave} guestEdits={projects.guestEdits}/>:null}{authMounted&&<Suspense fallback={null}><AuthDialog open={authOpen} intent={authIntent} onOpenChange={v=>{setAuthOpen(v);if(!v)setAuthIntent(null);}}/></Suspense>}</AccountCostSaveContext.Provider></CostDefaultsContext.Provider>;
};
export default StudioPage;
