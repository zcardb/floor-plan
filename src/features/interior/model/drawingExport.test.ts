import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import DxfParser from 'dxf-parser';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { blankDesign } from '../data/templates';
import { library } from '../data/catalog';
import { createDrawingDocument, createExportDocument } from './drawingDocument';
import { serializeDrawing, drawingFile, projectJsonFile, serializeProjectJson } from './drawingExport';
import { DXF_SAVED_BY, DXF_TEXT_STYLE, serializeDxf } from './dxfExport';
import { DXF_LAYER_STYLES } from './drawingStyle';
import { serializePdf } from './pdfExport';
import { drawingScale, drawingSheet } from './drawingScale';
import { DWG_ERROR, FOREIGN_SVG_ERROR, parseDesignFile } from './designImport';
import { furnitureDrawing } from './furnitureDrawing';
import { perimeterDimensions } from './perimeterDimensions';
import { editDimensionWalls } from './dimensionWallEdit';
import { splitWall } from './wallSplit';
import { validateDesign } from './validation';
import type { Design, Layers } from './types';
const layers:Layers={grid:true,dims:true,labels:true,furn:true,bearing:true,snap:true};
const fontBytes=readFileSync(resolve(process.cwd(),'public/fonts/NotoSansSC-Regular.ttf'));
function fixture(){
  const d=blankDesign();d.rooms[0].name='客厅 & <书房>';
  d.walls.push({id:'partition',a:[3000,0],b:[3000,d.depth],kind:'partition',thickness:240});
  d.openings.push({id:'door',wallId:'partition',kind:'door',offset:2000,width:900});
  d.furniture.push({id:'sofa',type:'sofa',name:'沙发',cx:2000,cy:3000,w:1800,d:800,rot:45,color:'#a08060'});
  return d;
}
/** Canvas has dimensions hidden; exports must still contain everything. */
const hiddenOnCanvas=(d:Design):Design=>({...d,dimensionSettings:{...d.dimensionSettings,visible:false}});
const file=(name:string,text:string,size=text.length)=>({name,size,text:async()=>text});
/** DXF tag pairs (group code, value) after the leading 999 payload comments. */
function dxfTags(text:string){
  const lines=text.split(/\r?\n/),tags:[string,string][]=[];
  for(let i=0;i+1<lines.length;i+=2)tags.push([lines[i].trim(),lines[i+1]]);
  return tags;
}
/** Group-code → value map of the record `0 <type>` whose name (code 2) is `name`. */
function dxfRecord(text:string,type:string,name:string){
  const tags=dxfTags(text);
  for(let i=0;i<tags.length;i++){
    if(tags[i][0]!=='0'||tags[i][1]!==type)continue;
    const end=tags.findIndex((t,j)=>j>i&&t[0]==='0'),body=tags.slice(i+1,end<0?undefined:end);
    if(body.some(([c,v])=>c==='2'&&v===name))return new Map(body);
  }
  return undefined;
}
/** $HANDSEED must exceed every object handle (codes 5 / 105) for strict CAD readers. */
function handseedValid(text:string){
  const tags=dxfTags(text),at=tags.findIndex(([c,v])=>c==='9'&&v==='$HANDSEED');
  const seed=parseInt(tags[at+1][1],16);
  // tags[at+1] is the $HANDSEED value itself, not an object handle.
  const max=Math.max(...tags.filter(([c],i)=>(c==='5'||c==='105')&&i!==at+1).map(([,v])=>parseInt(v,16)));
  return seed>max;
}
async function ocgNames(bytes:Uint8Array){
  const pdf=await PDFDocument.load(bytes);
  const props=pdf.catalog.lookup(PDFName.of('OCProperties'),PDFDict);
  const ocgs=props.lookup(PDFName.of('OCGs'),PDFArray);
  return {pdf,names:ocgs.asArray().map(ref=>(pdf.context.lookup(ref,PDFDict).get(PDFName.of('Name')) as unknown as {decodeText():string}).decodeText())};
}
describe('工程交换图',()=>{
  it('分割后SVG/DXF保持洞口和净距，子段均能矢量导出',()=>{
    const d=fixture(), next=splitWall(d,'partition',[50,300]).design;
    const before=createDrawingDocument(d,layers),after=createDrawingDocument(next,layers);
    expect(after.dimensions.map(dim=>dim.measurement)).toEqual(before.dimensions.map(dim=>dim.measurement));
    expect(after.entities.filter(e=>e.layer==='OPENINGS')).toEqual(before.entities.filter(e=>e.layer==='OPENINGS'));
    expect(XMLValidator.validate(serializeDrawing(next,'svg'))).toBe(true);
    const parsed=new DxfParser().parseSync(serializeDrawing(next,'dxf'))!;
    expect(parsed.entities.filter(e=>e.type==='DIMENSION')).toHaveLength(after.dimensions.length);
    expect(parsed.entities.filter(e=>e.layer==='WALLS')).toHaveLength(after.entities.filter(e=>e.layer==='WALLS').length);
  });
  it('尺寸驱动后DXF/SVG和JSON保留真实新净距，而非文字覆盖', () => {
    const d = fixture();
    const binding = perimeterDimensions(d)!.chains.flatMap(c => c.segments).find(s => s.binding?.startWalls.includes('partition') && s.binding.endWalls.includes('outer-1'))!.binding!;
    const next = editDimensionWalls(d, binding, 2200, 'end');
    const svg = serializeDrawing(next, 'svg'); expect(svg).toContain('2.20 m');
    const dxf = new DxfParser().parseSync(serializeDrawing(next, 'dxf'))!;
    expect(dxf.entities.some(e => e.type === 'DIMENSION' && 'actualMeasurement' in e && e.actualMeasurement === 2200)).toBe(true);
    expect(serializeDrawing(JSON.parse(JSON.stringify(next)), 'svg')).toBe(svg);
    expect(svg).not.toContain('dimension-selected');
  });
  it('独立解析器回读毫米单位、真实原生尺寸与关联显示块及中文文本',()=>{
    const d=fixture(),document=createExportDocument(d),text=serializeDrawing(d,'dxf');
    const parsed=new DxfParser().parseSync(text)!;
    expect(parsed.header.$ACADVER).toBe('AC1021');expect(parsed.header.$INSUNITS).toBe(4);expect(parsed.header.$MEASUREMENT).toBe(1);
    expect(parsed.header.$DWGCODEPAGE).toBe('ANSI_1252');expect(parsed.header.$LASTSAVEDBY).toBe(DXF_SAVED_BY);
    const style=dxfRecord(text,'STYLE',DXF_TEXT_STYLE);
    expect(style?.get('3')).toBe('simplex.shx');expect(style?.get('4')).toBe('gbcbig.shx');
    const textStyles=dxfTags(text).flatMap(([c,v],i,all)=>c==='0'&&v==='TEXT'?[all.slice(i+1,all.findIndex((t,j)=>j>i&&t[0]==='0')).find(([code])=>code==='7')?.[1]]:[]);
    expect(textStyles.length).toBeGreaterThan(0);expect(textStyles.every(s=>s===DXF_TEXT_STYLE)).toBe(true);
    expect(handseedValid(text)).toBe(true);expect(handseedValid(serializeDxf(document))).toBe(true);
    const dimensions=parsed.entities.filter(e=>e.type==='DIMENSION');expect(dimensions).toHaveLength(document.dimensions.length);
    expect(Object.keys(parsed.blocks).filter(name=>name.startsWith('*D'))).toHaveLength(dimensions.length);
    for (const entity of dimensions) {
      const dim = entity as typeof entity & { block: string; dimensionType: number; actualMeasurement: number; linearOrAngularPoint1: {x:number;y:number}; linearOrAngularPoint2: {x:number;y:number} };
      expect(parsed.blocks[dim.block]?.entities?.length).toBeGreaterThan(0);
      expect(dim.dimensionType & 32).toBe(32);
      expect(Math.hypot(dim.linearOrAngularPoint2.x-dim.linearOrAngularPoint1.x,dim.linearOrAngularPoint2.y-dim.linearOrAngularPoint1.y)).toBeCloseTo(dim.actualMeasurement);
    }
    // 门的开启弧线在门图块内，模型空间只有 INSERT。
    expect(Object.values(parsed.blocks).some(b=>b.entities?.some(e=>e.type==='ARC'))).toBe(true);
    expect(parsed.entities.some(e=>e.type==='TEXT' && 'text' in e && e.text==='客厅 & <书房>')).toBe(true);
    expect(text).toContain('STUDIO_METERS');expect(text).not.toContain('NaN');
    const manual=dimensions.find(e=>e.layer==='DIMENSIONS');expect(manual).toBeDefined();
    expect(Object.values(parsed.blocks).some(b=>b.entities?.some(e=>e.type==='TEXT'&&'text'in e&&/^\d+\.\d\d m$/.test(String(e.text))))).toBe(true);
  });
  it('DXF开头写入分段999方案数据，几何输出与不嵌入时一致',()=>{
    const d=fixture(),text=serializeDrawing(d,'dxf'),lines=text.split('\n');
    expect(lines[0]).toBe('999');
    const comments=lines.filter((_,i)=>i%2===1&&lines[i-1]==='999');
    expect(comments.length).toBeGreaterThan(1);
    expect(comments.every(line=>line.length<=2000)).toBe(true);
    expect(text.endsWith(serializeDxf(createExportDocument(d)))).toBe(true);
  });
  it('SVG无CSS样式表、按比例出图、Inkscape图层与对象子组、嵌入方案数据',()=>{
    const d=fixture(),svg=serializeDrawing(d,'svg','我的家');expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).not.toMatch(/<style|dominant-baseline|var\(--|<image|data-export-hide|selection-overlay|plan-grid/);
    expect(svg).toContain('inkscape:groupmode="layer"');
    expect(svg).toMatch(/<g id="[^"]+" inkscape:label="沙发"><title>沙发<\/title>/);
    expect(svg).toMatch(/<g id="墙体" inkscape:groupmode="layer" inkscape:label="墙体" fill="#514a40"/);
    expect(svg).toContain('Noto Sans SC');expect(svg).toContain('<metadata>');
    expect(svg).toContain('客厅 &amp; &lt;书房&gt;');
    const root=new XMLParser({ignoreAttributes:false}).parse(svg).svg,box=root['@_viewBox'].split(' ').map(Number);
    const sheet=drawingSheet(createExportDocument(d));
    expect(sheet.scale).toBe(50);expect(root['@_width']).toMatch(/mm$/);
    expect(Number.parseFloat(root['@_width'])).toBeCloseTo(box[2]/50);expect(Number.parseFloat(root['@_height'])).toBeCloseTo(box[3]/50);
  });
  it('比例：10 m 户型 1:50，60 m 户型 1:100 或更小，超大按 1:200',()=>{
    expect(drawingScale(10400,8400)).toBe(50);
    expect(drawingScale(60000,30000)).toBeGreaterThanOrEqual(100);
    expect(drawingScale(200000,1000)).toBe(200);
  });
  it('画布关掉家具/尺寸后，SVG/DXF/PDF导出仍包含全部图层',async()=>{
    const d=hiddenOnCanvas(fixture());
    expect(createDrawingDocument(d,{...layers,furn:false}).entities.some(e=>e.layer==='FURNITURE')).toBe(false);
    const svg=serializeDrawing(d,'svg');
    for(const name of ['家具','尺寸标注','房间名称'])expect(svg).toContain(`inkscape:label="${name}"`);
    const dxf=new DxfParser().parseSync(serializeDrawing(d,'dxf'))!;
    expect(dxf.entities.some(e=>e.layer==='FURNITURE')).toBe(true);
    expect(dxf.entities.some(e=>e.type==='DIMENSION'&&e.layer==='DIMENSIONS')).toBe(true);
    const {names}=await ocgNames(await serializePdf(createExportDocument(d),{fontBytes}));
    expect(names).toEqual(expect.arrayContaining(['家具','尺寸标注']));
  });
  it('PDF可回读：1页、页面尺寸与比例一致、OCG数等于图层数、字体子集嵌入',async()=>{
    const document=createExportDocument(fixture()),sheet=drawingSheet(document);
    const bytes=await serializePdf(document,{fontBytes,title:'我的家'});
    const {pdf,names}=await ocgNames(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const {width,height}=pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(sheet.paperWidth*72/25.4,1);expect(height).toBeCloseTo(sheet.paperHeight*72/25.4,1);
    const used=new Set([...document.entities,...document.dimensions.flatMap(d=>d.display)].map(e=>e.layer));
    expect(names).toHaveLength(used.size);
    expect(bytes.length).toBeLessThan(fontBytes.length);
  });
  it('往返：SVG/DXF/JSON 导出后导入，方案深度相等',async()=>{
    const d=fixture(),expected=validateDesign(d);
    for(const [ext,text] of [['svg',serializeDrawing(d,'svg','我的家')],['dxf',serializeDrawing(d,'dxf','我的家')],['json',serializeProjectJson(d,'我的家')]] as const){
      const result=await parseDesignFile(file(`导出.${ext}`,text));
      expect(result.name,ext).toBe('我的家');expect(result.kind==='design'&&result.design,ext).toEqual(expected);
    }
  });
  it('外部DXF（无嵌入方案数据）交给识别流程，带图层与毫米单位',async()=>{
    const result=await parseDesignFile(file('户型.dxf',serializeDxf(createExportDocument(fixture()))));
    expect(result.kind).toBe('dxf');expect(result.name).toBe('户型');
    if(result.kind!=='dxf')return;
    expect(result.source.unit).toBe('mm');expect(result.source.layers.map(l=>l.name)).toEqual(expect.arrayContaining(['WALLS','OPENINGS']));
  });
  it('负向：外部SVG、DWG、无线条DXF、损坏JSON、超过5MB、未知格式都报错',async()=>{
    await expect(parseDesignFile(file('a.svg','<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).rejects.toThrow(FOREIGN_SVG_ERROR);
    await expect(parseDesignFile(file('a.dwg','AC1027'))).rejects.toThrow(DWG_ERROR);
    await expect(parseDesignFile(file('a.dxf','0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF'))).rejects.toThrow('没有可识别的线条');
    await expect(parseDesignFile(file('a.json','{broken'))).rejects.toThrow('格式不正确');
    await expect(parseDesignFile(file('a.json','{"version":2}'))).rejects.toThrow();
    await expect(parseDesignFile(file('big.json','{}',6*1024*1024))).rejects.toThrow('5 MB');
    await expect(parseDesignFile(file('a.png','x'))).rejects.toThrow();
  });
  it('CAD 规范：图层颜色 / 线宽 / 线型，拆除墙虚线，墙体实心填充，圆形写成 CIRCLE，家具门窗写成图块',()=>{
    const d=fixture();
    d.furniture.push({id:'table',type:'roundtable',name:'圆桌',cx:1500,cy:1500,w:1000,d:1000,rot:0,color:'#e2cfb4'},
      {id:'sofa2',type:'sofa',name:'沙发',cx:4500,cy:3000,w:1800,d:800,rot:90,color:'#a08060'});
    const document=createExportDocument(d),text=serializeDxf(document);
    const parsed=new DxfParser().parseSync(text)!;
    for(const [name,style] of Object.entries(DXF_LAYER_STYLES)){
      const layer=dxfRecord(text,'LAYER',name);
      expect(layer?.get('62'),name).toBe(String(style.color));
      expect(layer?.get('370'),name).toBe(String(style.lineweight));
      expect(layer?.get('6')?.toUpperCase(),name).toBe(style.lineType);
    }
    expect(dxfRecord(text,'LTYPE','DASHED')).toBeDefined();
    const walls=document.entities.filter(e=>e.layer==='WALLS'&&e.kind==='polyline'&&e.closed);
    expect(dxfTags(text).filter(([c,v])=>c==='0'&&v==='HATCH')).toHaveLength(walls.length);
    const inserts=parsed.entities.filter(e=>e.type==='INSERT');
    expect(inserts).toHaveLength(d.furniture.length+d.openings.length);
    expect(new Set(inserts.filter(e=>e.layer==='FURNITURE').map(e=>'name' in e?e.name:''))).toEqual(new Set(['FURN_sofa_1800x800','FURN_roundtable_1000x1000']));
    expect(parsed.blocks['FURN_roundtable_1000x1000']?.entities?.some(e=>e.type==='CIRCLE')).toBe(true);
    expect(parsed.entities.some(e=>e.layer==='FURNITURE'&&e.type!=='INSERT')).toBe(false);
    expect(serializeDrawing(d,'svg')).toMatch(/<circle cx="1500" cy="1500" r="500"\/>/);
    expect(handseedValid(text)).toBe(true);expect(text).not.toContain('NaN');
  });
  it('所有当前家具几何均可矢量导出，含楼梯踏步、植物变换和多子路径',()=>{
    for(const item of library){const geometry=furnitureDrawing({...item,id:'item',cx:100,cy:-100,rot:35});
      expect(geometry.length,item.type).toBeGreaterThan(0);
      for(const e of geometry)if(e.kind==='polyline')expect(e.points.flat().every(Number.isFinite),item.type).toBe(true);
    }
    expect(furnitureDrawing({id:'stair',type:'stairs',name:'楼梯',w:1000,d:3000,cx:0,cy:0,rot:0,color:'#aaa'}).length).toBeGreaterThan(12);
  });
  it('画布关闭显示层只保留实际结构，导出不修改设计',()=>{
    const d=fixture(),before=JSON.stringify(d),document=createDrawingDocument(d,{...layers,dims:false,furn:false,labels:false});
    expect(document.dimensions).toHaveLength(0);
    expect(document.entities.some(e=>e.layer==='FURNITURE'||e.layer==='ROOM_LABELS')).toBe(false);
    serializeDrawing(d,'svg');expect(JSON.stringify(d)).toBe(before);
    expect(()=>serializeDrawing({...d,walls:[]},'dxf')).toThrow('有效墙体');
  });
  it('移动结构后导出尺寸变化，保持1000mm真实模型和负坐标',()=>{
    const d=fixture(),before=serializeDrawing(d,'dxf');d.walls[d.walls.length-1].a[0]=2000;d.walls[d.walls.length-1].b[0]=2000;
    expect(serializeDrawing(d,'dxf')).not.toBe(before);
    const parsed=new DxfParser().parseSync(serializeDrawing(d,'dxf'))!;
    expect(parsed.entities.some(e=>'vertices' in e && Array.isArray(e.vertices) && e.vertices.some((p:{x:number;y:number})=>p.x<0||p.y<0))).toBe(true);
  });
  it('导出文件使用正确扩展名和类型；无有效墙体时拒绝生成',async()=>{
    const d=fixture(),svg=await drawingFile(d,'svg','项/目');
    expect(svg.name).toBe('项-目.svg');expect(svg.blob.type).toContain('image/svg+xml');
    expect(await svg.blob.text()).toBe(serializeDrawing(d,'svg','项/目'));
    const json=projectJsonFile(d,'项目');
    expect(json.name).toBe('项目.json');expect(json.blob.type).toBe('application/json');
    expect(await json.blob.text()).toBe(serializeProjectJson(d,'项目'));
    for(const format of ['dxf','svg','pdf'] as const)await expect(drawingFile({...fixture(),walls:[]},format,'项目')).rejects.toThrow('有效墙体');
  });
});
