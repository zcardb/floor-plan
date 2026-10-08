import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LibraryItem } from '../model/types';
import { furnitureTypes, resolvedFurnitureType, appearanceDimensions, type FurnitureOutline } from '../model/furnitureAppearance';
import { FurnitureShape } from './FurnitureShape';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
export function FurnitureGeometryEditor({item,save,onSaved}:{item:LibraryItem;save:(item:LibraryItem)=>Promise<boolean>;onSaved:(item:LibraryItem)=>void}) {
  const [type,setType]=useState(item.type),[shape,setShape]=useState<FurnitureOutline>(item.shape||'reference'),[width,setWidth]=useState(meterDraft(item.w)),[depth,setDepth]=useState(meterDraft(item.d)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const widthMm=parseMeterDraft(width),depthMm=shape==='circle'?widthMm:parseMeterDraft(depth);
  const validDimensions=[widthMm,depthMm].every(value=>Number.isFinite(value)&&value>=50&&value<=20000);
  const preview={...item,type:resolvedFurnitureType(item.name,type),shape,...appearanceDimensions(shape,validDimensions?widthMm:item.w,validDimensions?depthMm:item.d)};
  const apply=async()=>{
    if(busy)return;
    if(!validDimensions){setError('尺寸应为0.05～20 m');return;}
    setBusy(true);setError('');
    try {if(await save(preview))onSaved(preview);else setError('参考几何保存失败');} catch(e){setError(e instanceof Error?e.message:'保存失败');} finally{setBusy(false);}
  };
  return <details className="furniture-geometry-editor"><summary>调整参考类型与外形</summary><div className="furniture-geometry-fields">
    <Label>参考类型<Select value={type} onValueChange={setType} disabled={busy}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">按名称匹配</SelectItem>{furnitureTypes.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Label>
    <Label>外形<Select value={shape} onValueChange={value=>setShape(value as FurnitureOutline)} disabled={busy}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="reference">参考原形</SelectItem><SelectItem value="rectangle">方形</SelectItem><SelectItem value="circle">圆形</SelectItem></SelectContent></Select></Label>
    <Label>{shape==='circle'?'直径 m':'宽 m'}<Input type="number" min={0.05} max={20} step={0.001} value={width} onChange={e=>setWidth(e.target.value)} disabled={busy}/></Label>
    {shape!=='circle'&&<Label>深 m<Input type="number" min={0.05} max={20} step={0.001} value={depth} onChange={e=>setDepth(e.target.value)} disabled={busy}/></Label>}
    <div className="cms-item-visual"><svg viewBox={`${-preview.w/2-100} ${-preview.d/2-100} ${preview.w+200} ${preview.d+200}`}><FurnitureShape f={preview}/></svg></div>
    <small>只修改参考几何；原生成图片和已放置到项目中的家具不变。</small>
    {error&&<p className="form-error" role="alert">{error}</p>}<Button type="button" disabled={busy} onClick={()=>void apply()}>{busy?'正在保存…':'保存参考几何'}</Button>
  </div></details>;
}
