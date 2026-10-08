import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uid, type LibraryItem } from '../model/types';
import { furnitureTypes, resolvedFurnitureType, appearanceDimensions, type FurnitureOutline } from '../model/furnitureAppearance';
import { FurnitureShape } from './FurnitureShape';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import { useFurnitureImage } from '../cloud/useFurnitureImage';

export function FurnitureGeometryEditor({item,save,onSaved,onWorkChange}:{item:LibraryItem;save:(item:LibraryItem)=>Promise<boolean>;onSaved:(item:LibraryItem)=>void;onWorkChange?:(phase:'idle'|'generating'|'saving')=>void}) {
  const [type,setType]=useState(item.type),[shape,setShape]=useState<FurnitureOutline>(item.shape||'reference'),[width,setWidth]=useState(meterDraft(item.w)),[depth,setDepth]=useState(meterDraft(item.d)),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const ai=useFurnitureImage();
  const lock=useRef(false),request=useRef<string | undefined>(undefined),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=saving||ai.busy;
  useEffect(()=>{onWorkChange?.(saving?'saving':ai.busy?'generating':'idle');return()=>onWorkChange?.('idle');},[saving,ai.busy,onWorkChange]);
  const widthMm=parseMeterDraft(width),depthMm=shape==='circle'?widthMm:parseMeterDraft(depth);
  const validDimensions=[widthMm,depthMm].every(value=>Number.isFinite(value)&&value>=50&&value<=20000);
  const preview={...item,type:resolvedFurnitureType(item.name,type),shape,...appearanceDimensions(shape,validDimensions?widthMm:item.w,validDimensions?depthMm:item.d)};
  const invalidate=()=>{ai.cancel();request.current=undefined;setError('');};
  const generate=async()=>{
    if(lock.current)return;
    if(!validDimensions){setError('尺寸应为0.05～20 m');return;}
    lock.current=true;setError('');request.current??=uid();
    try{const url=await ai.generate({...preview,height:item.height||700},request.current,()=>{request.current=undefined;});if(url)request.current=undefined;}
    finally{lock.current=false;}
  };
  const apply=async(withImage=false)=>{
    if(lock.current)return;
    if(!validDimensions){setError('尺寸应为0.05～20 m');return;}
    if(withImage&&!ai.image)return;
    lock.current=true;setSaving(true);setError('');
    const next=withImage?{...preview,imageUrl:ai.image}:preview;
    try {if(await save(next)){if(mounted.current){ai.cancel();onSaved(next);}}else if(mounted.current)setError('家具保存失败，生成图片已保留，可重试保存');}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'保存失败');}
    finally{lock.current=false;if(mounted.current)setSaving(false);}
  };
  return <details className="furniture-geometry-editor"><summary>调整参考类型与外形</summary><div className="furniture-geometry-fields">
    <Label>参考类型<Select value={type} onValueChange={value=>{invalidate();setType(value);}} disabled={busy}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">按名称匹配</SelectItem>{furnitureTypes.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Label>
    <Label>外形<Select value={shape} onValueChange={value=>{invalidate();setShape(value as FurnitureOutline);}} disabled={busy}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="reference">参考原形</SelectItem><SelectItem value="rectangle">方形</SelectItem><SelectItem value="circle">圆形</SelectItem></SelectContent></Select></Label>
    <Label>{shape==='circle'?'直径 m':'宽 m'}<Input type="number" min={0.05} max={20} step={0.001} value={width} onChange={e=>{invalidate();setWidth(e.target.value);}} disabled={busy}/></Label>
    {shape!=='circle'&&<Label>深 m<Input type="number" min={0.05} max={20} step={0.001} value={depth} onChange={e=>{invalidate();setDepth(e.target.value);}} disabled={busy}/></Label>}
    <div className="cms-item-visual"><svg viewBox={`${-preview.w/2-100} ${-preview.d/2-100} ${preview.w+200} ${preview.d+200}`}><FurnitureShape f={preview}/></svg></div>
    <small>仅保存参考几何不会替换原图；已放置到项目中的家具始终不变。</small>
    <Button type="button" disabled={busy||!validDimensions} onClick={()=>void apply()}>{saving?'正在保存…':'保存参考几何'}</Button>
    <div className="furniture-image-regeneration">
      <Button type="button" variant="outline" disabled={busy||!validDimensions} onClick={()=>void generate()}>{ai.busy?<Loader2 className="animate-spin" size={16}/>:<RefreshCw size={16}/>} {ai.busy?'正在生成图片…':ai.error?'重试生成任务':'重新生成图片'}</Button>
      <small>使用当前参考类型、外形与尺寸生成，可能消耗 AI 额度。生成后预览，手动保存才替换账号库图片。</small>
      {ai.busy&&<p role="status">正在生成统一风格外观…</p>}
      {ai.image&&<><div className="furniture-generated-preview"><img src={ai.image} crossOrigin="anonymous" alt={item.name+'的新图片预览'}/></div><small>新图片预览 · 尚未保存</small><div className="furniture-image-actions"><Button type="button" disabled={busy} onClick={()=>void apply(true)}>保存参考几何与图片</Button><Button type="button" variant="ghost" disabled={busy} onClick={invalidate}>放弃新图片</Button></div></>}
      {ai.error&&<p className="form-error" role="alert">{ai.error}</p>}
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div></details>;
}
