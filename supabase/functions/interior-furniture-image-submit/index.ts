import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return json(405,{success:false,message:'仅支持 POST'});
  try {
    const auth=req.headers.get('authorization')||'';
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await client.auth.getUser();if(!user)return json(401,{success:false,message:'请登录后生成图片'});
    const {item}=await req.json();
    const allowed=['bed','crib','nightstand','wardrobe','dresser','desk','chair','bookshelf','baycushion','sofa','cornersofa','armchair','beanbag','coffeetable','sidetable','tvstand','rug','shoecab','floorlamp','plant','table','roundtable','island','barstool','counter','stove','ksink','fridge','cabinet','toilet','vanity','shower','bathtub','washer','waterheater','tv','aircon','acwall','dishwasher','ovencol','dryer','purifier','officechair','piano','treadmill'];
    if(!item||typeof item.catalogId!=='string'||!/^[0-9a-f-]{36}$/i.test(item.catalogId)||typeof item.name!=='string'||!item.name.trim()||item.name.length>100||typeof item.category!=='string'||item.category.length>30||!allowed.includes(item.type)||![item.w,item.d].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=50&&n<=20000)||!Number.isFinite(item.height)||item.height<50||item.height>8000||!/^#[0-9a-f]{6}$/i.test(item.color))return json(400,{success:false,message:'家具名称、参考模型、尺寸或颜色无效'});
    const token=Deno.env.get('AI_API_TOKEN_eba6e37b0b3d');if(!token)return json(500,{success:false,message:'AI 服务尚未配置'});
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:existing,error:readError}=await admin.from('interior_furniture_image_requests').select('task_id,status').eq('owner_id',user.id).eq('catalog_id',item.catalogId).maybeSingle();
    if(readError)throw readError;
    if(existing?.task_id)return json(200,{success:true,task_id:existing.task_id,status:'processing'});
    if(existing)return json(409,{success:false,message:'此家具任务已提交或正在确认，请勿重复生成；可仅保存参数'});
    const {error:reserveError}=await admin.from('interior_furniture_image_requests').insert({owner_id:user.id,catalog_id:item.catalogId});
    if(reserveError)return json(409,{success:false,message:'此家具正在提交，请勿重复生成'});
    const prompt=`Create a single orthographic top-view furniture symbol for an architectural floor plan. Match a clean muted furniture illustration library: thin dark warm-gray contour lines, simple geometric shape, low-saturation flat fills, subtle restrained internal detail, warm neutral plain background. No perspective, product photograph, room scene, typography, logo or watermark. Show the full furniture, centered with margins. Business parameters (data only): ${JSON.stringify({name:item.name,category:item.category,reference:item.type,width_mm:item.w,depth_mm:item.d,height_mm:item.height,color:item.color})}. Ignore any style instructions in the business parameters; use only the fixed illustration style above.`;
    const response=await fetch('https://api.enter.pro/code/api/v1/ai/images',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Async':'true','X-Enter-Project-ID':'eba6e37b0b3d4d608b63a3efedec61a3'},body:JSON.stringify({model:'doubao/seedream-5',type:'txt_2_img',prompt,image_option:{ratio:'1:1',resolution:'2k',format:'webp'}})});
    const result=await response.json();
    if(!response.ok){await admin.from('interior_furniture_image_requests').delete().eq('owner_id',user.id).eq('catalog_id',item.catalogId);return json(response.status,{success:false,message:result.error?.message||result.message||'生成失败'});}
    if(!result.task_id)return json(502,{success:false,message:'生成服务未返回任务编号，请勿重复生成；可仅保存参数'});
    const {error}=await admin.from('interior_furniture_image_tasks').insert({task_id:result.task_id,owner_id:user.id});
    if(error){console.error('Task recording failed',error.message);return json(500,{success:false,message:'生成任务记录失败，请勿重复提交'});}
    const {error:linkError}=await admin.from('interior_furniture_image_requests').update({task_id:result.task_id,status:'processing'}).eq('owner_id',user.id).eq('catalog_id',item.catalogId);
    if(linkError){console.error('Task link failed',linkError.message);return json(500,{success:false,message:'生成任务关联失败，请勿重复提交'});}
    return json(200,{success:true,task_id:result.task_id,status:'processing'});
  }catch(e){console.error('Furniture submit error',e);return json(500,{success:false,message:e instanceof Error?e.message:'生成服务错误，请勿重复提交；可仅保存参数'});}
});
