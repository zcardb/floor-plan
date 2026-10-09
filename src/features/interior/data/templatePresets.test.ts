import { describe, expect, it } from 'vitest';
import { TEMPLATE_PRESETS, createProject } from './templates';
import { validateDesign } from '../model/validation';
import { aabb, bbox } from '../model/geometry';
import { isPristineDesign } from '../model/templateState';

const bounds = (f: Parameters<typeof aabb>[0]) => { const {hw,hh}=aabb(f); return {x:f.cx-hw,y:f.cy-hh,x2:f.cx+hw,y2:f.cy+hh}; };
describe('六套内置模板', () => {
  it('预设编号唯一且数量为六', () => expect(new Set(TEMPLATE_PRESETS.map(p=>p.id)).size).toBe(6));
  for (const p of TEMPLATE_PRESETS) {
    it(`${p.id} 能加载、克隆和识别初始方案`, () => {
      const d=p.build();
      expect(()=>validateDesign(d)).not.toThrow();
      expect(d.furniture.length).toBeGreaterThanOrEqual(18);
      expect(isPristineDesign(createProject(p.id).state)).toBe(true);
      const copy=p.build();d.furniture[0].cx+=100;
      expect(copy.furniture[0].cx).not.toBe(d.furniture[0].cx);
    });
    if(p.id!=='reference')it(`${p.id} 家具无越界及意外重叠`,()=>{
      const d=p.build(), rooms=d.rooms.map(r=>bbox(r.rings[0]));
      for(const f of d.furniture){const a=bounds(f);expect(rooms.some(b=>a.x>=b.x-1&&a.y>=b.y-1&&a.x2<=b.x2+1&&a.y2<=b.y2+1),f.name+' 越界').toBe(true);}
      for(let i=0;i<d.furniture.length;i++)for(let j=i+1;j<d.furniture.length;j++){
        const a=d.furniture[i],b=d.furniture[j];
        if([a.type,b.type].some(t=>['rug','baycushion'].includes(t))||(a.type==='counter'&&['stove','ksink'].includes(b.type))||(b.type==='counter'&&['stove','ksink'].includes(a.type)))continue;
        const aa=bounds(a),bb=bounds(b);
        expect(Math.min(aa.x2,bb.x2)-Math.max(aa.x,bb.x)>5&&Math.min(aa.y2,bb.y2)-Math.max(aa.y,bb.y)>5,a.name+' 与 '+b.name+' 重叠').toBe(false);
      }
    });
  }
});
