import { useState } from 'react';
import { Plus, Pencil, Copy, Trash2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import { createProject } from '../data/templates';
import type { useProjects,ProjectSummary } from '../cloud/useProjects';
export function ProjectManager({projects,opened}:{projects:ReturnType<typeof useProjects>;opened:()=>void}){
  const [local,setLocal]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[template,setTemplate]=useState<'blank'|'reference'>('blank'),[rename,setRename]=useState<ProjectSummary|null>(null),[deleting,setDeleting]=useState<ProjectSummary|null>(null),[busy,setBusy]=useState(false);
  const list=local?projects.guests:projects.cloud;
  return <><div className="cms-heading"><div><h1>项目管理</h1><p>把每个空间的灵感，保存成独立方案。</p></div><Button onClick={()=>{setName('');setCreating(true);}}><Plus/>新建项目</Button></div>
  <div className="project-tabs"><button className={!local?'active':''} onClick={()=>setLocal(false)}>云端项目</button><button className={local?'active':''} onClick={()=>setLocal(true)}>本机方案</button></div>
  {local&&<p className="muted-note">保留的历史本机方案；复制到云端后管理，不会删除原记录。</p>}
  {projects.loading&&<p role="status">正在读取项目…</p>}
  {!projects.loading&&!list.length&&<div className="cms-empty"><LayoutTemplate size={36}/><h2>还没有设计项目</h2><p>新建空白户型，开始规划你的空间。</p></div>}
  <div className="cms-project-grid">{list.map(row=><article className="cms-card" key={row.id}><LayoutTemplate size={30}/><h2>{row.name}</h2><p>{new Date(row.updatedAt).toLocaleDateString('zh-CN')}</p><div className="cms-card-actions"><Button size="sm" onClick={async()=>{if(local){const p=projects.guests.find(p=>p.id===row.id);if(p&&await projects.create(p,true))opened();}else if(await projects.open(row))opened();}}>{local?'复制到云端':'打开设计'}</Button>{!local&&<><button aria-label={'重命名'+row.name} onClick={()=>{setRename(row);setName(row.name);}}><Pencil size={16}/></button><button aria-label={'复制'+row.name} onClick={()=>void projects.duplicate(row)}><Copy size={16}/></button><button aria-label={'删除'+row.name} onClick={()=>setDeleting(row)}><Trash2 size={16}/></button></>}</div></article>)}</div>
  {!local&&<div className="project-list-footer"><button onClick={()=>void projects.reload()}>刷新项目</button>{projects.hasMore&&<button onClick={()=>void projects.loadMore()}>加载更多</button>}</div>}
  <Dialog open={creating||!!rename} onOpenChange={v=>{if(!v){setCreating(false);setRename(null);}}}><DialogContent><DialogHeader><DialogTitle>{rename?'重命名项目':'新建项目'}</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader><form className="cms-form" onSubmit={async e=>{e.preventDefault();setBusy(true);if(rename){await projects.rename(rename,name);setRename(null);}else if(await projects.create(createProject(template,name),true)){setCreating(false);opened();}setBusy(false);}}><label>项目名称<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>{!rename&&<label>户型模板<select value={template} onChange={e=>setTemplate(e.target.value as typeof template)}><option value="blank">空白户型</option><option value="reference">参考户型</option></select></label>}<Button disabled={busy}>{busy?'正在保存…':'确认保存'}</Button></form></DialogContent></Dialog>
  <AlertDialog open={!!deleting} onOpenChange={v=>{if(!v)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>不可撤销。请先下载需要保留的方案。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={()=>{if(deleting)void projects.remove(deleting);setDeleting(null);}}>删除项目</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
