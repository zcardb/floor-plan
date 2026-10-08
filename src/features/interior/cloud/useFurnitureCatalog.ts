import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { categories } from '../data/catalog';
import type { LibraryItem } from '../model/types';
import { validFurnitureType, validFurnitureOutline } from '../model/furnitureAppearance';
export function useFurnitureCatalog() {
  const [items,setItems] = useState<LibraryItem[]>([]), [loading,setLoading] = useState(false), [error,setError] = useState(''), [count,setCount] = useState(0), [counts,setCounts] = useState<Record<string,number>>({}), [hasMore,setHasMore] = useState(false);
  const epoch = useRef(0), offset = useRef(0);
  const reset = useCallback(() => { epoch.current++; offset.current=0; setItems([]); setCount(0); setCounts({}); setError(''); setLoading(false); }, []);
  const load = useCallback(async (more=false) => {
    const run=++epoch.current; setLoading(true); setError('');
    try {
    const {data:{session}} = await supabase.auth.getSession();
    if (run !== epoch.current) return;
    if (!session) { reset(); return; }
    const start=more?offset.current:0;
    const [page,stats] = await Promise.all([
      supabase.from('interior_furniture_catalog').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('catalog_id').range(start,start+23),
      Promise.all(categories.map(async category => { const {count,error} = await supabase.from('interior_furniture_catalog').select('catalog_id',{count:'exact',head:true}).eq('category',category); if(error)throw error; return [category,count||0] as const; })).catch((e:Error)=>e),
    ]);
    if(run!==epoch.current)return;
    setLoading(false);
    if(page.error || stats instanceof Error){setError(page.error?.message || (stats as Error).message);return;}
    const mapped=(page.data||[]).map(r=>({catalogId:r.catalog_id,name:r.name,category:r.category,type:r.type,shape:r.shape as LibraryItem['shape'],w:Number(r.width),d:Number(r.depth),height:Number(r.height),color:r.color,price:r.price===null?null:Number(r.price),imageUrl:r.image_url||undefined}));
    offset.current=start+mapped.length; setItems(old=>more?[...old,...mapped]:mapped); setCount(page.count||0); setCounts(Object.fromEntries(stats)); setHasMore(offset.current<(page.count||0));
    } catch(cause) {
      if(run!==epoch.current)return;
      setLoading(false);setError(cause instanceof Error?cause.message:'家具读取失败，请重试');
    }
  },[reset]);
  const save=useCallback(async(item:LibraryItem)=>{
    if(!validFurnitureType(item.type)||!validFurnitureOutline(item.shape))throw new Error('参考类型或外形无效');
    const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('请先登录');
    const {error}=await supabase.from('interior_furniture_catalog').upsert({owner_id:session.user.id,catalog_id:item.catalogId!,name:item.name,category:item.category,type:item.type,shape:item.shape??null,width:item.w,depth:item.d,height:item.height||700,color:item.color,price:item.price??null,image_url:item.imageUrl||null},{onConflict:'owner_id,catalog_id'});
    if(error)throw new Error(error.message);return true;
  },[]);
  const remove=useCallback(async(catalogId:string)=>{
    const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('请先登录');
    const {error}=await supabase.from('interior_furniture_catalog').delete().eq('owner_id',session.user.id).eq('catalog_id',catalogId);
    if(error)throw new Error(error.message);return true;
  },[]);
  return {items,loading,error,count,counts,hasMore,load,save,remove,reset};
}
