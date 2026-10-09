import { useEffect,useRef,useState } from 'react';
import { length } from '../model/geometry';
import { canResizeWall, isBearingWall, openingIsLocked, BEARING_WALL_WARNING } from '../model/wallPolicy';
import { RotationControls } from './RotationControls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { meterDraft, sizeDraftToModel } from '../model/lengthUnits';
import type { Design,Selection } from '../model/types';
import type { SizeTransaction } from '../model/sizeTransaction';
function sizeFields(d:Design,s:Selection):[string,string,number][] {
  if(s?.kind==='furniture'){const f=d.furniture.find(f=>f.id===s.id);return f?[['w','宽度 / m',f.w],['d',f.type==='stairs'?'长度 / m':'深度 / m',f.d],['cx','中心 X / m',f.cx],['cy','中心 Y / m',f.cy]]:[];}
  if(s?.kind==='wall'){const w=d.walls.find(w=>w.id===s.id);return w?[['length','长度 / m',length(w)],['thickness','墙厚 / m',w.thickness]]:[];}
  if(s?.kind==='opening'){const o=d.openings.find(o=>o.id===s.id);return o?[['width','宽度 / m',o.width],['offset','沿墙位置 / m',o.offset],['height','高度 / m',o.height??(o.kind==='door'?2100:1600)],...(o.kind==='window'?[['sill','窗台高 / m',o.sill??800] as [string,string,number]]:[])]:[];}
  return [];
}
export function SizeFields({design,selection,transaction,close}:{design:Design;selection:Selection;transaction:SizeTransaction;close?:()=>void}){
  const fields=useRef(sizeFields(design,selection));
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.current.map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]))),[error,setError]=useState('');
  const token=useRef<symbol|null>(null),invalid=useRef(false),edited=useRef(new Set<string>());
  invalid.current=!!error;
  const draftFromDesign=()=>Object.fromEntries(sizeFields(design,selection).map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]));
  const [resync,setResync]=useState(0);
  // 未在本表单改过的字段跟随模型实时刷新（如加宽后自动平移的位置、另一处表单或拖拽的改动）。
  useEffect(()=>{
    const latest=Object.fromEntries(sizeFields(design,selection).map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]));
    setDraft(prev=>{const next={...prev};let changed=false;for(const [key,value] of Object.entries(latest))if(!edited.current.has(key)&&next[key]!==value){next[key]=value;changed=true;}return changed?next:prev;});
  },[design,selection,resync]);
  // 输入即生效：失焦或弹窗关闭时把预览合并成一步撤销；非法输入则放弃本次预览并回显当前值。
  const settle=(silent=false)=>{
    const t=token.current;
    token.current=null;
    edited.current.clear();
    if(!t)return;
    if(invalid.current){transaction.cancel(t);if(!silent)setResync(n=>n+1);}
    else if(!transaction.apply(t)&&!silent&&transaction.isActive(t))setError('尺寸编辑已结束，请重新打开');
  };
  const settleRef=useRef(settle);
  settleRef.current=settle;
  useEffect(()=>()=>settleRef.current(true),[]);
  const cancel=()=>{const t=token.current;token.current=null;edited.current.clear();if(t)transaction.cancel(t);setError('');setDraft(draftFromDesign());close?.();};
  const furniture=selection?.kind==='furniture'?design.furniture.find(f=>f.id===selection.id):null;
  const wall=selection?.kind==='wall'?design.walls.find(w=>w.id===selection.id):null;
  const opening=selection?.kind==='opening'?design.openings.find(o=>o.id===selection.id):null;
  const bearingWarning=wall&&design.template!=='blank'&&isBearingWall(wall);
  if(wall&&!canResizeWall(design,wall))return <p className="visual-locked">此项目创建时锁定了结构尺寸，复制该项目后副本可自由调整。</p>;
  if(opening&&openingIsLocked(design,opening.wallId))return <p className="visual-locked">承重墙上的门窗洞口已锁定，不能修改尺寸。</p>;
  return <div onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}>{bearingWarning&&<p className="muted-note" role="note">{BEARING_WALL_WARNING}。</p>}<div className="visual-size-fields">{fields.current.map(([key,label])=><Label key={key} className="field-label">{label}<Input className="editor-control" aria-label={label} type="number" step={key==='rot'?1:0.01} value={draft[key]??''} onChange={e=>{
    if(!token.current||!transaction.isActive(token.current)){token.current=transaction.begin(selection);edited.current.clear();}
    edited.current.add(key);
    const next={...draft,[key]:e.target.value};setDraft(next);
    // 只提交改过的字段：未改动的两位草稿不得把模型原值取整写回。
    const changed=Object.fromEntries(Object.entries(next).filter(([name])=>edited.current.has(name)));
    try{transaction.update(token.current,sizeDraftToModel(changed));setError('');}catch(err){setError(err instanceof Error?err.message:'尺寸无效');}
  }} onBlur={()=>settle()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></Label>)}{furniture&&<RotationControls key={furniture.id} id={furniture.id} value={furniture.rot} transaction={transaction} close={close}/>}</div>{error&&<p className="form-error" role="alert">{error}</p>}<p className="muted-note">改动即时生效</p></div>;
}
