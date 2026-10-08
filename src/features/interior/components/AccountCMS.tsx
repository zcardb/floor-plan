import { useEffect, useState } from 'react';
import { FolderOpen,Armchair,Wallet,LogOut,LayoutTemplate,Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';
import { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import { ProjectManager } from './ProjectManager';
import { AccountCostManager } from './AccountCostManager';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { FurnitureShape } from './FurnitureShape';
export function AccountCMS({projects,costs,opened}:{projects:ReturnType<typeof useProjects>;costs:ReturnType<typeof useAccountCosts>;opened:()=>void}){
  const [tab,setTab]=useState('projects'),[creating,setCreating]=useState(false);
  const catalog=useFurnitureCatalog(),load=catalog.load,reset=catalog.reset;
  useEffect(()=>{if(tab!=='projects')void load();return reset;},[tab,load,reset]);
  const modules=[{id:'projects',name:'项目管理',icon:FolderOpen},{id:'furniture',name:'家具管理',icon:Armchair},{id:'costs',name:'成本管理',icon:Wallet}];
  return <div className="account-cms"><aside className="cms-sidebar"><div className="cms-brand"><LayoutTemplate/><b>筑间 STUDIO</b><small>我的设计工作室</small></div><nav aria-label="管理模块">{modules.map(m=><button key={m.id} className={tab===m.id?'active':''} onClick={()=>setTab(m.id)}><m.icon size={19}/>{m.name}</button>)}</nav><div className="cms-account"><small>{projects.session?.user.email}</small><button onClick={()=>void projects.signOut()}><LogOut size={16}/>退出登录</button></div></aside><main className="cms-main">
    {tab==='projects'?<ProjectManager projects={projects} opened={opened}/>:tab==='costs'?(costs.loading?<p>正在读取账号成本…</p>:<AccountCostManager key={projects.session?.user.id} settings={costs.settings} save={costs.save} saving={costs.saving} error={costs.error} items={catalog.items}/>):<><div className="cms-heading"><div><h1>账号家具库</h1><p>{catalog.count} 款家具 · 款式数，不是项目摆放件数</p></div><Button onClick={()=>setCreating(true)}><Plus/>新建家具</Button></div><div className="cms-category-counts">{Object.entries(catalog.counts).map(([c,n])=><span key={c}>{c} <b>{n} 款</b></span>)}</div>{catalog.error&&<p role="alert" className="form-error">{catalog.error}</p>}{catalog.loading&&<p>正在读取家具…</p>}<div className="cms-project-grid">{catalog.items.map(i=><article className="cms-card" key={i.catalogId}><div className="cms-furniture-visual">{i.imageUrl?<img src={i.imageUrl} crossOrigin="anonymous" alt={i.name} loading="lazy"/>:<svg viewBox={`${-i.w/2-100} ${-i.d/2-100} ${i.w+200} ${i.d+200}`}><FurnitureShape f={i}/></svg>}</div><h2>{i.name}</h2><p>{i.category} · {i.w} × {i.d} mm</p><small>默认单价 {i.price===null?'未定价':`¥${i.price}`}</small></article>)}</div>{!catalog.loading&&!catalog.items.length&&<div className="cms-empty"><Armchair size={36}/><h2>还没有自定义家具</h2><p>创建家具后，可从项目账号库中加入设计。</p></div>}{catalog.hasMore&&<Button variant="outline" disabled={catalog.loading} onClick={()=>void load(true)}>加载更多家具</Button>}</>}
  </main>{creating&&<CustomFurnitureDialog open={creating} onOpenChange={setCreating} loggedIn={true} login={()=>{}} ownerKey={projects.session!.user.id} accountOnly onCreate={()=>{void load();}} onImport={()=>{}}/>}</div>;
}
