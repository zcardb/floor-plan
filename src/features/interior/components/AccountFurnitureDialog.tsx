import { useState } from 'react';
import { Info,Loader2,Trash2 } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import type { LibraryItem } from '../model/types';
import { PriceInput } from './PriceInput';
import { FurnitureShape } from './FurnitureShape';
import { FurnitureGeometryEditor } from './FurnitureGeometryEditor';
import { formatMeters } from '../model/lengthUnits';
import { notify } from '@/lib/notify';
export function AccountFurnitureDialog({item,isCustom,referencePrice,onOpenChange,onChanged,applyDefaultPrice,remove,saveGeometry,commitBusy=false,commitError='',retryPrice,saved=false}:{commitBusy?:boolean;commitError?:string;retryPrice?:()=>Promise<boolean>;saved?:boolean;saveGeometry?:(item:LibraryItem)=>Promise<boolean>;applyDefaultPrice:(price:number|null)=>Promise<boolean>;item:LibraryItem;isCustom:boolean;referencePrice:number|null;onOpenChange:(v:boolean)=>void;onChanged:(next:LibraryItem|null)=>void;remove:(catalogId:string)=>Promise<boolean>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirming,setConfirming]=useState(false);
  const [editorPhase,setEditorPhase]=useState<'idle'|'generating'|'saving'>('idle');
  const working=busy||commitBusy||editorPhase!=='idle';
  const closeLocked=busy||commitBusy||editorPhase==='saving';
  const failure=commitError||error;
  const retry=async()=>{
    if(working||!retryPrice)return;
    setBusy(true);setError('');
    try { if(await retryPrice())notify.success('「'+item.name+'」账号默认单价已保存'); else setError('未能保存，请重试。'); }
    catch(cause){setError(cause instanceof Error?cause.message:'保存失败，请重试');}
    finally{setBusy(false);}
  };
  const applyPrice=async(price:number|null):Promise<boolean>=>{
    if(working||retryPrice)return false;setBusy(true);setError('');
    try { const ok=await applyDefaultPrice(price); if(ok)onChanged({...item,price}); else setError('未能保存，本次修改已保留，请重试。'); return ok; }
    catch(e){setError(e instanceof Error?e.message:'保存失败，请重试');notify.error('「'+item.name+'」单价保存失败',e);return false;}
    finally {setBusy(false);}
  };
  const drop=async()=>{
    if(working||retryPrice)return;setBusy(true);setError('');
    try { await remove(item.catalogId!);setConfirming(false);onChanged(null);onOpenChange(false);notify.success('已删除家具「'+item.name+'」'); }
    catch(e){setError(e instanceof Error?e.message:'删除失败，请重试');setConfirming(false);notify.error('删除家具「'+item.name+'」失败',e);}
    finally {setBusy(false);}
  };
  return <>
    <Dialog open onOpenChange={v=>{if(!closeLocked)onOpenChange(v);}}>
      <DialogContent className="cms-detail-dialog" onEscapeKeyDown={event=>{if(closeLocked)event.preventDefault();}} onInteractOutside={event=>{if(closeLocked)event.preventDefault();}}>
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
              <div><dt>参考尺寸</dt><dd>{formatMeters(item.w)} × {formatMeters(item.d)}{item.height?` × ${formatMeters(item.height)}`:''} m</dd></div>
              <div><dt>来源</dt><dd>{isCustom?'自定义':'内置'}</dd></div>
            </dl>
            {isCustom?<div className="cms-detail-price">
              <span className="cms-detail-label">账号默认单价 · 元 / 件</span>
              <PriceInput key={String(item.price)} value={item.price??null} disabled={working||!!retryPrice} label={item.name+'账号默认单价'} onApply={applyPrice}/>
              <small>仅影响未单独调价的项目；项目内改价仍以项目为准。</small>
            </div>:<div className="cms-detail-price">
              <span className="cms-detail-label">当前账号单价</span>
              <strong>{referencePrice===null?'未定价':`¥${referencePrice}`}</strong>
              <small className="cms-detail-hint"><Info size={13}/>内置家具的单价请在「成本管理」对应家具分类中设置。</small>
            </div>}
          </div>
        </div>
        {isCustom&&saveGeometry&&<fieldset disabled={busy||commitBusy||!!retryPrice} className="cost-edit-fields"><FurnitureGeometryEditor key={item.type+item.shape+item.w+item.d} item={item} save={saveGeometry} onSaved={onChanged} onWorkChange={setEditorPhase}/></fieldset>}
        {failure&&<div className="cost-save-error" role="alert"><span>{failure}</span>{retryPrice&&<Button variant="outline" disabled={working} onClick={()=>void retry()}>重试保存</Button>}</div>}
        {isCustom&&<p className="cost-sync" role="status">{editorPhase==='generating'?'正在生成，原图尚未替换':working?'正在保存…':saved&&!failure?'已保存并生效':'价格应用后自动保存；新图片需手动保存'}</p>}
        <div className="cms-detail-actions">
          {isCustom&&<Button type="button" variant="ghost" className="cms-detail-action text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={working||!!retryPrice} onClick={()=>setConfirming(true)}><Trash2 size={14}/>删除家具</Button>}
          <Button type="button" className="cms-detail-action" disabled={closeLocked} onClick={()=>onOpenChange(false)}>{closeLocked?<><Loader2 size={14}/>处理中…</>:editorPhase==='generating'?'取消生成并关闭':'完成'}</Button>
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
          <AlertDialogCancel disabled={working}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={working} onClick={e=>{e.preventDefault();void drop();}}>删除家具</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
