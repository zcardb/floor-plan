import { describe, expect, it } from 'vitest';
import { clampEditorPosition } from './useEditorDrag';
describe('浮条拖动边界',()=>{
  it('画布内位置不改变',()=>expect(clampEditorPosition({x:120,y:80},{width:800,height:600},{width:300,height:50})).toEqual({x:120,y:80}));
  it('钳制四边并在缩小时保留手柄',()=>{
    expect(clampEditorPosition({x:-20,y:-30},{width:800,height:600},{width:300,height:50})).toEqual({x:0,y:0});
    expect(clampEditorPosition({x:900,y:700},{width:800,height:600},{width:300,height:50})).toEqual({x:500,y:550});
    expect(clampEditorPosition({x:500,y:550},{width:200,height:40},{width:300,height:50})).toEqual({x:0,y:0});
  });
});
