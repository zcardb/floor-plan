import { editSelection } from './selectionEdits';
import type { Design, Selection } from './types';
export function createSizeTransaction(get:()=>Design,preview:(d:Design)=>void,commit:(next:Design,before:Design)=>void) {
  let active: { token:symbol; before:Design; last:Design; selection:Selection; invalid:boolean } | null=null;
  const cancel=(token?:symbol)=>{
    if(!active || (token&&active.token!==token))return;
    const previous=active;active=null;
    if(get()===previous.last)preview(previous.before);
  };
  return {
    begin(selection:Selection){cancel();const token=Symbol('dimensions'),before=get();active={token,before,last:before,selection,invalid:false};return token;},
    update(token:symbol,values:Record<string,string>){
      if(!active||active.token!==token||get()!==active.last)throw new Error('尺寸编辑已结束，请重新打开');
      active.invalid=true;
      if(Object.values(values).some(v=>v.trim()===''))throw new Error('尺寸不能为空');
      const next=editSelection(active.before,active.selection,Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Number(v)])));
      active.invalid=false;
      active.last=next;preview(next);
    },
    apply(token:symbol){if(!active||active.token!==token||get()!==active.last)return false;const {last,before}=active;active=null;commit(last,before);return true;},
    flush(){if(!active)return false;if(active.invalid){cancel();return false;}const {last,before}=active;active=null;if(get()!==last)return false;commit(last,before);return true;},
    isActive(token:symbol){return !!active&&active.token===token;},
    cancel,
  };
}
export type SizeTransaction=ReturnType<typeof createSizeTransaction>;
