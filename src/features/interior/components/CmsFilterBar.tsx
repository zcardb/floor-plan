export function CmsFilterBar({chips,value,onChange,label='分类筛选'}:{chips:{id:string;label:string;meta?:string}[];value:string;onChange:(id:string)=>void;label?:string}){
  return <div className="cms-filter-bar" role="group" aria-label={label}>{chips.map(c=><button key={c.id} className={c.id===value?'active':''} aria-pressed={c.id===value} onClick={()=>onChange(c.id)}>{c.label}{c.meta&&<b>{c.meta}</b>}</button>)}</div>;
}
