import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import type { Design } from '../model/types';
import { setPrice,type PriceGroup } from '../model/costs';
import { PriceInput } from './PriceInput';
import { MaterialProcurementEditor } from './MaterialProcurementEditor';
export function AccountCostDialog({group,entryKey,name,groupTitle,unit,design,change,price,done}:{group:PriceGroup;entryKey:string;name:string;groupTitle:string;unit:string;design:Design;change:(fn:(d:Design)=>Design)=>void;price:number|null;done:()=>void}){
  return <Dialog open onOpenChange={v=>{if(!v)done();}}>
    <DialogContent className="cms-detail-dialog">
      <DialogHeader>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>{groupTitle} · 账号默认单价 元 / {unit} · 未单独调价的项目自动继承。</DialogDescription>
      </DialogHeader>
      <div className="cms-detail-body single">
        <PriceInput key={entryKey+String(price)} value={price} label={name+'账号默认单价'} onApply={v=>change(d=>setPrice(d,group,entryKey,v))}/>
        <p className="footnote">留空并应用表示账号明确未定价，不会继续套用内置参考价。</p>
        {group==='floorPrices'&&<MaterialProcurementEditor design={{...design,rooms:[]}} material={entryKey} change={change}/>}
      </div>
      <div className="cms-detail-actions"><button className="cms-primary-action" onClick={done}>完成</button></div>
    </DialogContent>
  </Dialog>;
}
