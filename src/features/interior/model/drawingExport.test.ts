import { describe, expect, it, vi } from 'vitest';
import DxfParser from 'dxf-parser';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { blankDesign } from '../data/templates';
import { library } from '../data/catalog';
import { createDrawingDocument } from './drawingDocument';
import { serializeDrawing, downloadDrawing } from './drawingExport';
import { furnitureDrawing } from './furnitureDrawing';
import { perimeterDimensions } from './perimeterDimensions';
import { editDimensionWalls } from './dimensionWallEdit';
import type { Layers } from './types';
const layers:Layers={grid:true,dims:true,labels:true,furn:true,bearing:true,snap:true};
function fixture(){
  const d=blankDesign();d.rooms[0].name='客厅 & <书房>';
  d.walls.push({id:'partition',a:[3000,0],b:[3000,d.depth],kind:'partition',thickness:240});
  d.openings.push({id:'door',wallId:'partition',kind:'door',offset:2000,width:900});
  d.furniture.push({id:'sofa',type:'sofa',name:'沙发',cx:2000,cy:3000,w:1800,d:800,rot:45,color:'#a08060'});
  d.measures.push({id:'measure',a:[0,0],b:[1000,0]});return d;
}
describe('工程交换图',()=>{
  it('尺寸驱动后DXF/SVG和JSON保留真实新净距，而非文字覆盖', () => {
    const d = fixture();
    const binding = perimeterDimensions(d)!.chains.flatMap(c => c.segments).find(s => s.binding?.startWalls.includes('partition') && s.binding.endWalls.includes('outer-1'))!.binding!;
    const next = editDimensionWalls(d, binding, 2200, 'end');
    const svg = serializeDrawing(next, layers, 'svg'); expect(svg).toContain('2.20 m');
    const dxf = new DxfParser().parseSync(serializeDrawing(next, layers, 'dxf'))!;
    expect(dxf.entities.some(e => e.type === 'DIMENSION' && 'actualMeasurement' in e && e.actualMeasurement === 2200)).toBe(true);
    expect(serializeDrawing(JSON.parse(JSON.stringify(next)), layers, 'svg')).toBe(svg);
    expect(svg).not.toContain('dimension-selected');
  });
  it('独立解析器回读毫米单位、真实原生尺寸与关联显示块及中文文本',()=>{
    const d=fixture(),document=createDrawingDocument(d,layers),text=serializeDrawing(d,layers,'dxf');
    const parsed=new DxfParser().parseSync(text)!;
    expect(parsed.header.$ACADVER).toBe('AC1021');expect(parsed.header.$INSUNITS).toBe(4);expect(parsed.header.$MEASUREMENT).toBe(1);
    const dimensions=parsed.entities.filter(e=>e.type==='DIMENSION');expect(dimensions).toHaveLength(document.dimensions.length);
    expect(Object.keys(parsed.blocks).filter(name=>name.startsWith('*D'))).toHaveLength(dimensions.length);
    for (const entity of dimensions) {
      const dim = entity as typeof entity & { block: string; dimensionType: number; actualMeasurement: number; linearOrAngularPoint1: {x:number;y:number}; linearOrAngularPoint2: {x:number;y:number} };
      expect(parsed.blocks[dim.block]?.entities?.length).toBeGreaterThan(0);
      expect(dim.dimensionType & 32).toBe(32);
      expect(Math.hypot(dim.linearOrAngularPoint2.x-dim.linearOrAngularPoint1.x,dim.linearOrAngularPoint2.y-dim.linearOrAngularPoint1.y)).toBeCloseTo(dim.actualMeasurement);
    }
    expect(parsed.entities.some(e=>e.type==='ARC')).toBe(true);
    expect(parsed.entities.some(e=>e.type==='TEXT' && 'text' in e && e.text==='客厅 & <书房>')).toBe(true);
    expect(text).toContain('STUDIO_METERS');expect(text).not.toContain('NaN');
    const manual=dimensions.find(e=>e.layer==='MEASURES');expect(manual).toBeDefined();
    expect((manual as unknown as {actualMeasurement:number}).actualMeasurement).toBe(1000);
    const block=Object.values(parsed.blocks).find(b=>b.entities?.some(e=>e.type==='TEXT'&&'text'in e&&e.text==='1.00 m'));
    expect(block).toBeDefined();
  });
  it('SVG结构有效、自包含且物理毫米尺度与viewBox一致，无全图位图',()=>{
    const svg=serializeDrawing(fixture(),layers,'svg');expect(XMLValidator.validate(svg)).toBe(true);
    const root=new XMLParser({ignoreAttributes:false}).parse(svg).svg;
    const box=root['@_viewBox'].split(' ').map(Number);
    expect(Number.parseFloat(root['@_width'])).toBeCloseTo(box[2]);expect(root['@_width']).toMatch(/mm$/);
    expect(svg).toContain('客厅 &amp; &lt;书房&gt;');expect(svg).toContain('id="DIMENSIONS"');
    expect(svg).not.toMatch(/<image|var\(--|data-export-hide|selection-overlay|plan-grid/);
  });
  it('所有当前家具几何均可矢量导出，含楼梯踏步、植物变换和多子路径',()=>{
    for(const item of library){const geometry=furnitureDrawing({...item,id:'item',cx:100,cy:-100,rot:35});
      expect(geometry.length,item.type).toBeGreaterThan(0);
      for(const e of geometry)if(e.kind==='polyline')expect(e.points.flat().every(Number.isFinite),item.type).toBe(true);
    }
    expect(furnitureDrawing({id:'stair',type:'stairs',name:'楼梯',w:1000,d:3000,cx:0,cy:0,rot:0,color:'#aaa'}).length).toBeGreaterThan(12);
  });
  it('关闭显示层只保留实际结构和手工测量，导出不修改设计',()=>{
    const d=fixture(),before=JSON.stringify(d),document=createDrawingDocument(d,{...layers,dims:false,furn:false,labels:false});
    expect(document.dimensions.every(dim=>dim.layer==='MEASURES')).toBe(true);
    expect(document.entities.some(e=>e.layer==='FURNITURE'||e.layer==='ROOM_LABELS')).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
    expect(()=>serializeDrawing({...d,walls:[]},layers,'dxf')).toThrow('有效墙体');
  });
  it('移动结构后导出尺寸变化，保持1000mm真实模型和负坐标',()=>{
    const d=fixture(),before=serializeDrawing(d,layers,'dxf');d.walls[d.walls.length-1].a[0]=2000;d.walls[d.walls.length-1].b[0]=2000;
    expect(serializeDrawing(d,layers,'dxf')).not.toBe(before);
    const parsed=new DxfParser().parseSync(serializeDrawing(d,layers,'dxf'))!;
    expect(parsed.entities.some(e=>'vertices' in e && Array.isArray(e.vertices) && e.vertices.some((p:{x:number;y:number})=>p.x<0||p.y<0))).toBe(true);
  });
  it('下载使用正确扩展名并清理URL；空工程不创建下载链接',()=>{
    vi.useFakeTimers();const click=vi.fn(),revoke=vi.fn();
    vi.stubGlobal('document',{createElement:()=>({click})});vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:test'),revokeObjectURL:revoke});
    try{downloadDrawing(fixture(),layers,'svg','项目');expect(click).toHaveBeenCalledOnce();vi.runAllTimers();expect(revoke).toHaveBeenCalledWith('blob:test');
      expect(()=>downloadDrawing({...fixture(),walls:[]},layers,'dxf','项目')).toThrow();expect(click).toHaveBeenCalledOnce();
    }finally{vi.unstubAllGlobals();vi.useRealTimers();}
  });
});
