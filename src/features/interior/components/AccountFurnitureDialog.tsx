import { useState } from 'react';
import { Info,Loader2,Trash2 } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import type { LibraryItem } from '../model/types';
import { PriceInput } from './PriceInput';
import { FurnitureShape } from './FurnitureShape';
export function AccountFurnitureDialog({item,isCustom,referencePrice,onOpenChange,onChanged,save,remove}:{item:LibraryItem;isCustom:boolean;referencePrice:number|null;onOpenChange:(v:boolean)=>void;onChanged:(next:LibraryItem|null)=>void;save:(i:LibraryItem)=>Promise<boolean>;remove:(catalogId:string)=>Promise<boolean>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirming,setConfirming]=useState(false);
  const applyPrice=async(price:number|null)=>{
    if(busy)return;setBusy(true);setError('');
    try { if(await save({...item,price}))onChanged({...item,price}); }
    catch(e){setError(e instanceof Error?e.message:'保存失败，请重试');}
    finally {setBusy(false);}
  };
  const drop=async()=>{
    if(busy)return;setBusy(true);setError('');
    try { await remove(item.catalogId!);setConfirming(false);onChanged(null);onOpenChange(false); }
    catch(e){setError(e instanceof Error?e.message:'删除失败，请重试');setConfirming(false);}
    finally {setBusy(false);}
  };
  return <>
    <Dialog open onOpenChange={v=>{if(!busy)onOpenChange(v);}}>
      <DialogContent className="cms-detail-dialog">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{item.category} · {isCustom?'自定义家具':'内置家具'} · 画布按参考几何绘制，不是 3D 建模。</DialogDescription>
        </DialogHeader>
        <div className="cms-detail-body">
          <div className="cms-detail-visual">
            {item.imageUrl?<img src={item.imageUrl} crossOrigin="anonymous" alt={item.name}/>:<svg viewBox={`${-item.w/2-100} ${-item.d/2-100} ${item.w+200} ${item.d+200}`}><FurnitureShape f={item}/></svg>}
          </div>
          <div className="cms-detail-fields">
            <dl>
              <div><dt>分类</dt><dd>{item.category}</dd></div>
              <div><dt>参考尺寸</dt><dd>{item.w} × {item.d}{item.height?` × ${item.height}`:''} mm</dd></div>
              <div><dt>来源</dt><dd>{isCustom?'自定义':'内置'}</dd></div>
            </dl>
            {isCustom?<div className="cms-detail-price">
              <span className="cms-detail-label">账号默认单价 · 元 / 件</span>
              <PriceInput key={String(item.price)} value={item.price??null} label={item.name+'账号默认单价'} onApply={v=>void applyPrice(v)}/>
              <small>仅影响未单独调价的项目；项目内改价仍以项目为准。</small>
            </div>:<div className="cms-detail-price">
              <span className="cms-detail-label">内置参考价</span>
              <strong>{referencePrice===null?'未定价':`¥${referencePrice}`}</strong>
              <small className="cms-detail-hint"><Info size={13}/>内置家具的单价请在「成本管理 · 家具款式」中设置。</small>
            </div>}
          </div>
        </div>
        {error&&<p role="alert" className="form-error">{error}</p>}
        <div className="cms-detail-actions">
          {isCustom&&<button className="cms-danger-link" disabled={busy} onClick={()=>setConfirming(true)}><Trash2 size={14}/>删除家具</button>}
          <button className="cms-primary-action" disabled={busy} onClick={()=>onOpenChange(false)}>{busy?<><Loader2 size={14}/>处理中…</>:'完成'}</button>
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{item.name}」？</AlertDialogTitle>
          <AlertDialogDescription>账号家具库中的该款式会被移除；已放置到项目中的家具不受影响。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void drop();}}>删除家具</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
