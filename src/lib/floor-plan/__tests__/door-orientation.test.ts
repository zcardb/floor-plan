import { describe, expect, it } from 'vitest';
import { changeDoorOrientation, doorOrientation } from '../door-orientation';
import { doorSwingPoints } from '../door-type';
import { referenceDesign } from '../templates';
import { validateDesign } from '../validation';
import { selectionPoints } from '../selection-anchor';
import type { Opening } from '../types';
const door: Opening={id:'door',wallId:'wall',kind:'door',offset:1500,width:900};
describe('门的四种开向',()=>{
  it('默认保持旧门扇方向',()=>{
    expect(doorOrientation(door)).toMatchObject({hinge:'start',swingSide:-1,mirrorX:1,mirrorY:1,rotationSign:1});
    expect(doorSwingPoints(door)[0][0]).toBeCloseTo(-450);
    expect(doorSwingPoints(door)[0][1]).toBeCloseTo(-900);
  });
  it.each(['start','end'] as const)('铰链 %s 支持两侧开门，3D 开门符号一致',hinge=>{
    for(const swingSide of [-1,1] as const){
      const oriented={...door,hinge,swingSide};
      const points=doorSwingPoints(oriented),orientation=doorOrientation(oriented);
      expect(points[0][0]).toBeCloseTo(hinge==='start'?-450:450);
      expect(points[0][1]).toBeCloseTo(swingSide*900);
      expect(orientation.rotationSign).toBe(orientation.mirrorX*orientation.mirrorY);
      const world=selectionPoints({...referenceDesign(),walls:[{id:'wall',a:[0,0],b:[3000,0],thickness:240,kind:'partition'}],openings:[oriented]}, {kind:'opening',id:'door'});
      expect(world.some(p=>Math.abs(p[1]-swingSide*900)<0.001)).toBe(true);
    }
  });
  it('只更新目标门，不修改窗户或尺寸，并支持 JSON 往返',()=>{
    const design=referenceDesign(),target=design.openings.find(o=>o.kind==='door')!;
    const changed=changeDoorOrientation(design,target.id,{hinge:'end',swingSide:1});
    expect(changed.openings.find(o=>o.id===target.id)).toEqual({...target,hinge:'end',swingSide:1});
    expect(changed.openings.filter(o=>o.id!==target.id)).toEqual(design.openings.filter(o=>o.id!==target.id));
    expect(validateDesign(JSON.parse(JSON.stringify(changed))).openings).toEqual(changed.openings);
    expect(()=>validateDesign({...changed,openings:changed.openings.map(o=>o.id===target.id?{...o,hinge:'bad'}:o)})).toThrow();
    expect(()=>validateDesign({...changed,openings:changed.openings.map(o=>o.id===target.id?{...o,swingSide:0}:o)})).toThrow();
  });
});
