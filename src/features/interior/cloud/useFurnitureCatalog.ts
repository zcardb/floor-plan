import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { furnitureFromRow } from '../ai/furnitureRow';
import { categories } from '../data/catalog';
import type { LibraryItem } from '../model/types';
import { validFurnitureType, validFurnitureOutline } from '../model/furnitureAppearance';
import { sanitizeModel3d } from '../model/furniture3d';
import { BUILTIN_IDS } from '../model/builtinAssets';
/** 每页家具数：与项目管理一致，滚到底部再取下一页，不在首次进入时多取。 */
export const CATALOG_PAGE_SIZE = 12;
/** PostgREST 的 in 列表：值里有冒号和中文，逐个加双引号。 */
const BUILTIN_IN = `(${BUILTIN_IDS.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',')})`;
export function useFurnitureCatalog() {
  const [items,setItems] = useState<LibraryItem[]>([]), [loading,setLoading] = useState(false), [error,setError] = useState(''), [count,setCount] = useState(0), [counts,setCounts] = useState<Record<string,number>>({}), [hasMore,setHasMore] = useState(false);
  /** 内置家具的素材覆盖行（与内置家具同 catalogId）：不在翻页列表里，单独一次读全。 */
  const [overrides,setOverrides] = useState<LibraryItem[]>([]);
  const epoch = useRef(0), offset = useRef(0);
  const reset = useCallback(() => { epoch.current++; offset.current=0; setItems([]); setCount(0); setCounts({}); setError(''); setLoading(false); setOverrides([]); }, []);
  const loadOverrides = useCallback(async (run: number) => {
    const {data,error} = await supabase.from('interior_furniture_catalog').select('*').in('catalog_id', BUILTIN_IDS);
    if (!error && run === epoch.current) setOverrides((data||[]).map(furnitureFromRow));
  }, []);
  /** 每个分类的条数（筛选项上的数字）：慢，后台读，读到才更新。 */
  const loadStats = useCallback(async (run: number) => {
    const stats = await Promise.all(categories.map(async category => { const {count,error} = await supabase.from('interior_furniture_catalog').select('catalog_id',{count:'exact',head:true}).not('catalog_id','in',BUILTIN_IN).eq('category',category); if(error)throw error; return [category,count||0] as const; })).catch(()=>null);
    if(stats && run === epoch.current) setCounts(Object.fromEntries(stats));
  }, []);
  const load = useCallback(async (more=false) => {
    const run=++epoch.current; setLoading(true); setError('');
    try {
    const {data:{session}} = await supabase.auth.getSession();
    if (run !== epoch.current) return;
    if (!session) { reset(); return; }
    const start=more?offset.current:0;
    // 首屏只等这一页：分类计数是慢查询（每个分类一次），放后台补，不挡住列表出现。
    const page = await supabase.from('interior_furniture_catalog').select('*',{count:'exact'}).not('catalog_id','in',BUILTIN_IN).order('created_at',{ascending:false}).order('catalog_id').range(start,start+CATALOG_PAGE_SIZE-1);
    if(run!==epoch.current)return;
    setLoading(false);
    if(page.error){setError(page.error.message);return;}
    void loadStats(run);
    // 内置家具的覆盖行走 overrides，不出现在账号家具列表与计数里。
    if(!more)void loadOverrides(run);
    const mapped=(page.data||[]).map(furnitureFromRow);
    offset.current=start+mapped.length; setItems(old=>more?[...old,...mapped]:mapped); setCount(page.count||0); setHasMore(offset.current<(page.count||0));
    } catch(cause) {
      if(run!==epoch.current)return;
      setLoading(false);setError(cause instanceof Error?cause.message:'家具读取失败，请重试');
    }
  },[reset,loadOverrides,loadStats]);
  const save=useCallback(async(item:LibraryItem)=>{
    if(!validFurnitureType(item.type)||!validFurnitureOutline(item.shape))throw new Error('参考类型或外形无效');
    const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('请先登录');
    const {error}=await supabase.from('interior_furniture_catalog').upsert({owner_id:session.user.id,catalog_id:item.catalogId!,name:item.name,category:item.category,type:item.type,shape:item.shape??null,width:item.w,depth:item.d,height:item.height||700,color:item.color,price:item.price??null,image_url:item.imageUrl||null,image_3d_url:item.image3dUrl||null,model_3d:(sanitizeModel3d(item.model3d) ?? null) as unknown as Json},{onConflict:'owner_id,catalog_id'});
    if(error)throw new Error(error.message);return true;
  },[]);
  const remove=useCallback(async(catalogId:string)=>{
    const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('请先登录');
    const {error}=await supabase.from('interior_furniture_catalog').delete().eq('owner_id',session.user.id).eq('catalog_id',catalogId);
    if(error)throw new Error(error.message);return true;
  },[]);
  /** 保存内置家具的素材覆盖，成功后立即更新本地覆盖（素材库、画布同步都依赖它）。 */
  const saveOverride=useCallback(async(item:LibraryItem)=>{
    const ok=await save(item);
    if(ok)setOverrides(old=>[...old.filter(row=>row.catalogId!==item.catalogId),item]);
    return ok;
  },[save]);
  return {items,overrides,loading,error,count,counts,hasMore,load,save,remove,saveOverride,reset};
}
