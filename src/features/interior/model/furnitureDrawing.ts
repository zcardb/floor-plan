import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { XMLParser } from 'fast-xml-parser';
import { svgPathProperties } from 'svg-path-properties';
import { FurnitureShape } from '../components/FurnitureShape';
import type { Furniture, Point } from './types';
import type { DrawingEntity } from './drawingDocument';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true });
type XmlNode = Record<string, unknown>;
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function transform(text: string): Matrix {
  let matrix = identity;
  for (const match of text.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
    const v = match[2].trim().split(/[\s,]+/).map(Number); let next: Matrix = identity;
    if (match[1] === 'translate') next = [1,0,0,1,v[0],v[1] || 0];
    if (match[1] === 'scale') next = [v[0],0,0,v[1] ?? v[0],0,0];
    if (match[1] === 'matrix') next = v as Matrix;
    if (match[1] === 'rotate') {
      const a = v[0]*Math.PI/180, c=Math.cos(a),s=Math.sin(a);
      next = [c,s,-s,c,0,0];
      if (v.length === 3) next = multiply(multiply([1,0,0,1,v[1],v[2]], next),[1,0,0,1,-v[1],-v[2]]);
    }
    matrix = multiply(matrix,next);
  }
  return matrix;
}
// Adaptive sampling guarantees <=1mm chord error for current SVG furniture curves.
function samplePath(path: string): Point[][] {
  const subpaths = path.match(/[Mm][^Mm]*/g) || [];
  return subpaths.map(subpath => {
    const properties = new svgPathProperties(subpath), total = properties.getTotalLength();
    const point = (at:number):Point => { const p=properties.getPointAtLength(at);return [p.x,p.y]; };
    const points:Point[]=[point(0)];
    const add=(lo:number,hi:number,depth:number)=>{
      const a=point(lo),b=point(hi),mid=point((lo+hi)/2);
      const error=Math.hypot(mid[0]-(a[0]+b[0])/2,mid[1]-(a[1]+b[1])/2);
      if(depth<16 && (error>1 || hi-lo>25)){add(lo,(lo+hi)/2,depth+1);add((lo+hi)/2,hi,depth+1);}else points.push(b);
    };
    add(0,total,0);return points;
  });
}
export function furnitureDrawing(f: Furniture): DrawingEntity[] {
  const xml = renderToStaticMarkup(createElement(FurnitureShape,{f}));
  const entities:DrawingEntity[]=[];
  const angle=f.rot*Math.PI/180;
  const base:Matrix=[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),f.cx,f.cy];
  const visit=(nodes:XmlNode[],parent:Matrix)=>{
    for(const node of nodes){
      const tag=Object.keys(node).find(k=>k!==':@');if(!tag)continue;
      const attrs=(node[':@'] || {}) as Record<string,string>;
      const n=(key:string,fallback=0)=>Number(attrs[key]??fallback);
      const matrix=multiply(parent,transform(attrs.transform||''));
      const apply=([x,y]:Point):Point=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
      const push=(points:Point[],closed:boolean)=>{if(points.length>1)entities.push({kind:'polyline',layer:'FURNITURE',points:points.map(apply),closed});};
      if(tag==='g'){visit(node[tag] as XmlNode[],matrix);continue;}
      if(tag==='line')push([[n('x1'),n('y1')],[n('x2'),n('y2')]],false);
      else if(tag==='rect'){
        const x=n('x'),y=n('y'),w=n('width'),h=n('height'),rx=Math.min(n('rx'),w/2),ry=Math.min(n('ry',rx),h/2);
        if(rx>0&&ry>0){const p=`M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`;samplePath(p).forEach(points=>push(points,true));}
        else push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true);
      }else if(tag==='ellipse'||tag==='circle'){
        const rx=n(tag==='circle'?'r':'rx'),ry=n(tag==='circle'?'r':'ry'),r=Math.max(rx,ry);
        const count=Math.max(16,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-1/Math.max(r,1)))));
        push(Array.from({length:count},(_,i)=>[n('cx')+rx*Math.cos(i*2*Math.PI/count),n('cy')+ry*Math.sin(i*2*Math.PI/count)]),true);
      }else if(tag==='path')samplePath(attrs.d||'').forEach((points,i)=>push(points,/[zZ]\s*$/.test((attrs.d.match(/[Mm][^Mm]*/g)||[])[i]||'')));
      else throw new Error(`暂不支持导出家具图元：${tag}`);
    }
  };
  visit(parser.parse(xml),base);
  return entities;
}
