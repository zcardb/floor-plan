import type { DrawingDocument, DrawingEntity } from './drawingDocument';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const number=(n:number)=>Number(n.toFixed(5));
function element(e:DrawingEntity):string{
  if(e.kind==='polyline')return `<${e.closed?'polygon':'polyline'} points="${e.points.map(([x,y])=>`${number(x)},${number(y)}`).join(' ')}"/>`;
  if(e.kind==='text')return `<text x="${number(e.point[0])}" y="${number(e.point[1])}" font-size="${e.height}" transform="rotate(${e.rotation} ${number(e.point[0])} ${number(e.point[1])})">${escape(e.text)}</text>`;
  const a=[e.center[0]+e.radius*Math.cos(e.start),e.center[1]+e.radius*Math.sin(e.start)];
  const b=[e.center[0]+e.radius*Math.cos(e.end),e.center[1]+e.radius*Math.sin(e.end)];
  const sweep=e.clockwise?1:0;
  const angle=((e.clockwise?e.end-e.start:e.start-e.end)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  return `<path d="M${a.map(number).join(' ')}A${e.radius} ${e.radius} 0 ${angle>Math.PI?1:0} ${sweep} ${b.map(number).join(' ')}"/>`;
}
export function serializeSvg(document:DrawingDocument):string{
  const margin=200,b=document.bounds,x=b.x-margin,y=b.y-margin,w=b.x2-b.x+margin*2,h=b.y2-b.y+margin*2;
  const groups=new Map<string,string[]>();
  for(const entity of [...document.entities,...document.dimensions.flatMap(d=>d.display)]){
    const list=groups.get(entity.layer)||[];list.push(element(entity));groups.set(entity.layer,list);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(w)}mm" height="${number(h)}mm" viewBox="${[x,y,w,h].map(number).join(' ')}"><title>二维工程交换图</title><desc>模型单位：毫米；尺寸文字：米。曲线家具轮廓按1毫米容差矢量离散。</desc><style>g{fill:none;stroke:#514a40;stroke-width:12;stroke-linejoin:round}text{fill:#514a40;stroke:none;text-anchor:middle;dominant-baseline:central;font-family:Arial,sans-serif}#ROOMS{stroke:#b7afa3;stroke-width:6}#DEMOLISHED{stroke:#ad5145;stroke-dasharray:80 50}#DIMENSIONS,#MEASURES{stroke:#887b69;stroke-width:8}</style>${[...groups].map(([layer,items])=>`<g id="${layer}">${items.join('')}</g>`).join('')}</svg>`;
}
