import { EditorTooltip } from '@/components/ui/editor-tooltip';
export function CmsFilterBar({chips,value,onChange,label='分类筛选'}:{chips:{id:string;label:string;meta?:string}[];value:string;onChange:(id:string)=>void;label?:string}){
  const count=(meta?:string)=>meta?meta.replace(/\D+/g,'')||meta:meta;
  return <div className="cms-filter-bar" role="group" aria-label={label}>{chips.map(c=><EditorTooltip key={c.id} label={c.label} description={c.meta?`只看「${c.label}」，共 ${count(c.meta)} 项`:`只看「${c.label}」`}><button className={c.id===value?'active':''} aria-pressed={c.id===value} onClick={()=>onChange(c.id)}>{c.label}{c.meta&&<b>{c.meta}</b>}</button></EditorTooltip>)}</div>;
}
