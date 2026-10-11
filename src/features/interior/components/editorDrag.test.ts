import { describe, expect, it } from 'vitest';
import { clampEditorPosition } from './useEditorDrag';
describe('浮条拖动边界',()=>{
  it('画布内位置不改变',()=>expect(clampEditorPosition({x:120,y:80},{width:800,height:600},{width:300,height:50})).toEqual({x:120,y:80}));
  it('钳制四边并在缩小时保留手柄',()=>{
    expect(clampEditorPosition({x:-20,y:-30},{width:800,height:600},{width:300,height:50})).toEqual({x:0,y:0});
    expect(clampEditorPosition({x:900,y:700},{width:800,height:600},{width:300,height:50})).toEqual({x:500,y:550});
    expect(clampEditorPosition({x:500,y:550},{width:200,height:40},{width:300,height:50})).toEqual({x:0,y:0});
  });
  it('画布竖条（窄高）同样限制在画布内，默认右边缘居中位置不被改动',()=>{
    const stage={width:900,height:600},rail={width:46,height:120};
    const automatic={x:stage.width-rail.width-16,y:(stage.height-rail.height)/2};
    expect(clampEditorPosition(automatic,stage,rail)).toEqual({x:838,y:240});
    expect(clampEditorPosition({x:1000,y:-50},stage,rail)).toEqual({x:854,y:0});
    expect(clampEditorPosition({x:-10,y:700},stage,rail)).toEqual({x:0,y:480});
  });
});
