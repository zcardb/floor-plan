import { useEffect,useRef,useState } from 'react';
import { length } from '../model/geometry';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { meterDraft, sizeDraftToModel } from '../model/lengthUnits';
import type { Design,Selection } from '../model/types';
import type { SizeTransaction } from '../model/sizeTransaction';
function sizeFields(d:Design,s:Selection):[string,string,number][] {
  if(s?.kind==='furniture'){const f=d.furniture.find(f=>f.id===s.id);return f?[['w','宽 / m',f.w],['d',f.type==='stairs'?'长 / m':'深 / m',f.d],['cx','中心 X / m',f.cx],['cy','中心 Y / m',f.cy],['rot','旋转 / °',f.rot]]:[];}
  if(s?.kind==='wall'){const w=d.walls.find(w=>w.id===s.id);return w?[['length','长度 / m',length(w)],['thickness','墙厚 / m',w.thickness]]:[];}
  if(s?.kind==='opening'){const o=d.openings.find(o=>o.id===s.id);return o?[['width','宽度 / m',o.width],['offset','沿墙位置 / m',o.offset],['height','高度 / m',o.height??(o.kind==='door'?2100:1600)],...(o.kind==='window'?[['sill','窗台高 / m',o.sill??800] as [string,string,number]]:[])]:[];}
  return [];
}
export function SizeFields({design,selection,transaction,close}:{design:Design;selection:Selection;transaction:SizeTransaction;close?:()=>void}){
  const fields=useRef(sizeFields(design,selection));
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.current.map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]))),[error,setError]=useState('');
  const token=useRef<symbol|null>(null),invalid=useRef(false);
  invalid.current=!!error;
  const draftFromDesign=()=>Object.fromEntries(sizeFields(design,selection).map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]));
  // 输入即生效：失焦或弹窗关闭时把预览合并成一步撤销；非法输入则放弃本次预览。
  const settle=(silent=false)=>{
    const t=token.current;
    token.current=null;
    if(!t)return;
    if(invalid.current)transaction.cancel(t);
    else if(!transaction.apply(t)&&!silent&&transaction.isActive(t))setError('尺寸编辑已结束，请重新打开');
  };
  const settleRef=useRef(settle);
  settleRef.current=settle;
  useEffect(()=>()=>settleRef.current(true),[]);
  const cancel=()=>{const t=token.current;token.current=null;if(t)transaction.cancel(t);setError('');setDraft(draftFromDesign());close?.();};
  const wall=selection?.kind==='wall'?design.walls.find(w=>w.id===selection.id):null;
  const locked=wall&&(design.template!=='blank'||wall.kind!=='partition');
  if(locked)return <p className="visual-locked">原始建筑结构已锁定，不能修改尺寸。</p>;
  return <div onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}><div className="visual-size-fields">{fields.current.map(([key,label])=><Label key={key}>{label}<Input className="editor-control" aria-label={label} type="number" step={key==='rot'?1:0.001} value={draft[key]??''} onChange={e=>{
    if(!token.current||!transaction.isActive(token.current))token.current=transaction.begin(selection);
    const next={...draft,[key]:e.target.value};setDraft(next);
    try{transaction.update(token.current,sizeDraftToModel(next));setError('');}catch(err){setError(err instanceof Error?err.message:'尺寸无效');}
  }} onBlur={()=>settle()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></Label>)}</div>{error&&<p className="form-error" role="alert">{error}</p>}<p className="muted-note">改动即时生效</p></div>;
}
