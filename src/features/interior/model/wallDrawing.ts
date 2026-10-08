import { length,nearestOnWall } from './geometry';
import type { Design,Point } from './types';
export interface WallSnap { point:Point; target?:{wallId:string;kind:'endpoint'|'intersection'} }
export function resolveWallPoint(raw:Point,d:Design,scale:number,snap:boolean,start?:Point,exclude?:string):WallSnap {
  const horizontal=start?Math.abs(raw[0]-start[0])>=Math.abs(raw[1]-start[1]):null;
  const point:Point=start?(horizontal?[raw[0],start[1]]:[start[0],raw[1]]):[...raw];
  if(!snap)return {point};
  const tolerance=12/scale,candidates:{point:Point;wallId:string;kind:'endpoint'|'intersection';distance:number}[]=[];
  for(const w of d.walls){
    if(w.id===exclude||d.demolished.includes(w.id))continue;
    const accept=(p:Point,kind:'endpoint'|'intersection')=>{
      if(kind==='intersection'&&start&&((horizontal&&Math.abs(p[1]-start[1])>0.01)||(!horizontal&&Math.abs(p[0]-start[0])>0.01)))return;
      const reference=kind==='endpoint'?raw:point;
      const distance=Math.hypot(p[0]-reference[0],p[1]-reference[1]);
      if(distance<=tolerance+(kind==='intersection'?w.thickness/2:0))candidates.push({point:p,wallId:w.id,kind,distance});
    };
    accept(w.a,'endpoint');accept(w.b,'endpoint');
    if(!start){accept(nearestOnWall(point,w).point,'intersection');continue;}
    const axis=horizontal?1:0,delta=w.b[axis]-w.a[axis];
    if(Math.abs(delta)>0.001){const t=(start[axis]-w.a[axis])/delta;if(t>=0&&t<=1)accept([w.a[0]+t*(w.b[0]-w.a[0]),w.a[1]+t*(w.b[1]-w.a[1])],'intersection');}
  }
  candidates.sort((a,b)=>a.kind===b.kind?a.distance-b.distance:a.kind==='endpoint'?-1:1);
  const found=candidates[0];return found?{point:[...found.point],target:{wallId:found.wallId,kind:found.kind}}:{point};
}
export function resolveWallHover(raw:Point,d:Design,scale:number):WallSnap {
  const result=resolveWallPoint(raw,d,scale,true);
  const wall=result.target&&d.walls.find(w=>w.id===result.target?.wallId);
  return wall?{...result,point:nearestOnWall(raw,wall).point}:{point:[...raw]};
}
export function validateWallSegment(d:Design,a:Point,b:Point,exclude?:string){
  const candidate={a,b},L=length(candidate as Design['walls'][number]);
  if(L<100)throw new Error('墙段长度至少为0.1 m');
  const dx=(b[0]-a[0])/L,dy=(b[1]-a[1])/L;
  for(const w of d.walls){if(w.id===exclude||d.demolished.includes(w.id))continue;
    const cross=(p:Point)=>Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx),along=(p:Point)=>(p[0]-a[0])*dx+(p[1]-a[1])*dy;
    if(cross(w.a)<0.1&&cross(w.b)<0.1&&Math.min(L,Math.max(along(w.a),along(w.b)))-Math.max(0,Math.min(along(w.a),along(w.b)))>0.1)throw new Error('不能绘制重叠墙段');
    const wx=w.b[0]-w.a[0],wy=w.b[1]-w.a[1],den=(b[0]-a[0])*wy-(b[1]-a[1])*wx;
    if(Math.abs(den)<0.001)continue;
    const t=((w.a[0]-a[0])*wy-(w.a[1]-a[1])*wx)/den,u=((w.a[0]-a[0])*(b[1]-a[1])-(w.a[1]-a[1])*(b[0]-a[0]))/den;
    if(t>=0&&t<=1&&u>=0&&u<=1&&d.openings.some(o=>o.wallId===w.id&&Math.abs(o.offset-u*length(w))<o.width/2))throw new Error('连接不能穿过门窗开口');
  }
}
