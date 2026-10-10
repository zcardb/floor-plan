import { useEffect,useRef,useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { length } from '../model/geometry';
import { canResizeWall, isOnBearingWall, BEARING_WALL_LOCKED, BEARING_WALL_WARNING } from '../model/wallPolicy';
import { RotationControls } from './RotationControls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { meterDraft, sizeDraftToModel } from '../model/lengthUnits';
import type { Design,Selection } from '../model/types';
import type { SizeTransaction } from '../model/sizeTransaction';
import { placementGaps, wallPlacement } from '../model/wallPlacement';
import { WallPlacementDiagram } from './WallPlacementDiagram';
/** 门窗与贴墙家具的位置改为「到所在墙段两端的净距」（gapA 为左 / 上端，gapB 为右 / 下端）。 */
function gapFields(d:Design,s:Selection):[string,string,number][] {
  const p=wallPlacement(d,s);if(!p)return [];
  const [g0,g1]=placementGaps(p);
  return [['gapA',`① 距${p.names[0]}端 / m`,g0],['gapB',`② 距${p.names[1]}端 / m`,g1]];
}
function sizeFields(d:Design,s:Selection):[string,string,number][] {
  if(s?.kind==='furniture'){const f=d.furniture.find(f=>f.id===s.id);if(!f)return [];const gaps=gapFields(d,s);return [['w','宽度 / m',f.w],['d',f.type==='stairs'?'长度 / m':'深度 / m',f.d],...(gaps.length?gaps:[['cx','中心 X / m',f.cx],['cy','中心 Y / m',f.cy]] as [string,string,number][])];}
  if(s?.kind==='wall'){const w=d.walls.find(w=>w.id===s.id);return w?[['length','长度 / m',length(w)],['thickness','墙厚 / m',w.thickness]]:[];}
  if(s?.kind==='opening'){const o=d.openings.find(o=>o.id===s.id);return o?[...gapFields(d,s),['width','宽度 / m',o.width],['height','高度 / m',o.height??(o.kind==='door'?2100:1600)],...(o.kind==='window'?[['sill','窗台高 / m',o.sill??800] as [string,string,number]]:[])]:[];}
  return [];
}
export function SizeFields({design,selection,transaction,close}:{design:Design;selection:Selection;transaction:SizeTransaction;close?:()=>void}){
  const fields=useRef(sizeFields(design,selection));
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.current.map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]))),[error,setError]=useState('');
  const token=useRef<symbol|null>(null),invalid=useRef(false),edited=useRef(new Set<string>());
  invalid.current=!!error;
  const draftFromDesign=()=>Object.fromEntries(sizeFields(design,selection).map(([key,,value])=>[key,key==='rot'?String(value):meterDraft(value)]));
  const [resync,setResync]=useState(0);
  /** 正在编辑的净距（对应示意图上高亮的那一段）。 */
  const [focusGap,setFocusGap]=useState<0|1|null>(null);
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
  const bearingWarning=opening&&isOnBearingWall(design,opening.wallId);
  if(wall&&!canResizeWall(design,wall))return <p className="visual-locked"><LockKeyhole size={15}/>{BEARING_WALL_LOCKED}</p>;
  const placement=wallPlacement(design,selection);
  const field=([key,label]:[string,string,number])=><Label key={key} className="field-label">{label}<Input className="editor-control" aria-label={label} type="number" step={key==='rot'?1:0.01} value={draft[key]??''} onFocus={()=>setFocusGap(key==='gapA'?0:key==='gapB'?1:null)} onChange={e=>{
    if(!token.current||!transaction.isActive(token.current)){token.current=transaction.begin(selection);edited.current.clear();}
    edited.current.add(key);
    // 两端净距互斥：改一端时另一端跟随模型刷新，不再作为输入提交。
    if(key==='gapA')edited.current.delete('gapB');
    if(key==='gapB')edited.current.delete('gapA');
    const next={...draft,[key]:e.target.value};setDraft(next);
    // 只提交改过的字段：未改动的两位草稿不得把模型原值取整写回。
    const changed=Object.fromEntries(Object.entries(next).filter(([name])=>edited.current.has(name)));
    try{transaction.update(token.current,sizeDraftToModel(changed));setError('');}catch(err){setError(err instanceof Error?err.message:'尺寸无效');}
  }} onBlur={()=>{setFocusGap(null);settle();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></Label>;
  const gaps=fields.current.filter(([key])=>key==='gapA'||key==='gapB'),others=fields.current.filter(([key])=>key!=='gapA'&&key!=='gapB');
  return <div onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}>{bearingWarning&&<p className="muted-note" role="note">{BEARING_WALL_WARNING}。</p>}
    {gaps.length>0&&placement&&<div className="wall-placement"><WallPlacementDiagram placement={placement} active={focusGap}/><div className="wall-placement-fields">{gaps.map(field)}</div></div>}
    <div className="visual-size-fields">{others.map(field)}{furniture&&<RotationControls key={furniture.id} id={furniture.id} value={furniture.rot} transaction={transaction} close={close}/>}</div>{error&&<p className="form-error" role="alert">{error}</p>}<p className="muted-note">{gaps.length?'位置按到所在墙段两端的净距调整，改一端另一端自动变化；改动即时生效':'改动即时生效'}</p></div>;
}
