export function CmsFilterBar({chips,value,onChange}:{chips:{id:string;label:string;meta?:string}[];value:string;onChange:(id:string)=>void}){
  return <div className="cms-filter-bar" role="group" aria-label="分类筛选">{chips.map(c=><button key={c.id} className={c.id===value?'active':''} aria-pressed={c.id===value} onClick={()=>onChange(c.id)}>{c.label}{c.meta&&<b>{c.meta}</b>}</button>)}</div>;
}
