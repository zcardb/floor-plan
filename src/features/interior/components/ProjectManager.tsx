import { useState } from 'react';
import { Plus,Pencil,Copy,Trash2,Cloud,LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import { createProject } from '../data/templates';
import type { useProjects,ProjectSummary } from '../cloud/useProjects';
const iconAction='h-8 w-8 text-muted-foreground hover:text-foreground';
export function ProjectManager({projects,opened}:{projects:ReturnType<typeof useProjects>;opened:()=>void}){
  const [creating,setCreating]=useState(false),[name,setName]=useState(''),[template,setTemplate]=useState<'blank'|'reference'>('blank'),[rename,setRename]=useState<ProjectSummary|null>(null),[deleting,setDeleting]=useState<ProjectSummary|null>(null),[busy,setBusy]=useState(false);
  const list:ProjectSummary[]=[...projects.guests.map(g=>({id:g.id,name:g.name,updatedAt:g.updatedAt,revision:g.revision,cloud:false})),...projects.cloud].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const copyToCloud=async(row:ProjectSummary)=>{const g=projects.guests.find(g=>g.id===row.id);if(g&&await projects.create(g,true))opened();};
  const open=async(row:ProjectSummary)=>{if(await projects.open(row))opened();};
  const rowActions=(row:ProjectSummary)=><><Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'重命名'+row.name} onClick={()=>{setRename(row);setName(row.name);}}><Pencil size={16}/></Button>{row.cloud?<Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'复制'+row.name} onClick={()=>void projects.duplicate(row)}><Copy size={16}/></Button>:<Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'复制到云端'+row.name} title="复制到云端" onClick={()=>void copyToCloud(row)}><Cloud size={16}/></Button>}<Button type="button" variant="ghost" size="icon" className={iconAction} aria-label={'删除'+row.name} onClick={()=>setDeleting(row)}><Trash2 size={16}/></Button></>;
  return <><div className="cms-heading"><div><h1>项目管理</h1><p>把每个空间的灵感，保存成独立方案。</p></div><Button onClick={()=>{setName('');setCreating(true);}}><Plus/>新建项目</Button></div>
  {projects.loading&&<p role="status">正在读取项目…</p>}
  {!projects.loading&&!list.length&&<div className="cms-empty"><LayoutTemplate size={36}/><h2>还没有设计项目</h2><p>新建空白户型，开始规划你的空间。</p></div>}
  <div className="cms-project-grid">{list.map(row=><article className="cms-card" key={row.id}><button type="button" className="cms-card-open" aria-label={'打开项目 '+row.name} onClick={()=>void open(row)}/><LayoutTemplate size={30}/><h2>{row.name}</h2><p>{new Date(row.updatedAt).toLocaleDateString('zh-CN')}</p><div className="cms-card-actions">{rowActions(row)}</div></article>)}</div>
  <div className="project-list-footer"><button onClick={()=>void projects.reload()}>刷新项目</button>{projects.hasMore&&<button onClick={()=>void projects.loadMore()}>加载更多</button>}</div>
  <Dialog open={creating||!!rename} onOpenChange={v=>{if(!v){setCreating(false);setRename(null);}}}><DialogContent><DialogHeader><DialogTitle>{rename?'重命名项目':'新建项目'}</DialogTitle><DialogDescription>项目内容与单独调价互不影响。</DialogDescription></DialogHeader><form className="cms-form" onSubmit={async e=>{e.preventDefault();setBusy(true);if(rename){await projects.rename(rename,name);setRename(null);}else if(await projects.create(createProject(template,name),true)){setCreating(false);opened();}setBusy(false);}}><div className="cms-field"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></div>{!rename&&<div className="cms-field"><Label htmlFor="project-template">户型模板</Label><Select value={template} onValueChange={v=>setTemplate(v as typeof template)}><SelectTrigger id="project-template"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="blank">空白户型</SelectItem><SelectItem value="reference">参考户型</SelectItem></SelectContent></Select></div>}<Button disabled={busy}>{busy?'正在保存…':'确认保存'}</Button></form></DialogContent></Dialog>
  <AlertDialog open={!!deleting} onOpenChange={v=>{if(!v)setDeleting(null);}}><AlertDialogContent className="confirm-dialog"><AlertDialogHeader><AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>不可撤销。请先下载需要保留的方案。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={()=>{if(deleting)void projects.remove(deleting);setDeleting(null);}}>删除项目</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
