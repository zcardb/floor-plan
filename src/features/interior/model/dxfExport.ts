import {
  AlignedDimension, BlockFlags, DxfWriter, HatchBoundaryPaths, HatchPolylineBoundary, HatchPredefinedPatterns, LWPolylineFlags,
  TextHorizontalAlignment, TextVerticalAlignment, Units, pattern, point3d, vertex,
} from '@tarikjabiri/dxf';
import type { DxfBlock, DxfLayer } from '@tarikjabiri/dxf';
import type { DrawingDocument, DrawingEntity } from './drawingDocument';
import type { Point } from './types';
import { PAYLOAD_MARKER } from './designPayload';
import { DXF_DASHED_PATTERN, DXF_LAYER_STYLES, DXF_WALL_HATCH_LAYER, type DxfLayerName } from './drawingStyle';
/** Max characters per DXF 999 comment line (R2000+ string limit is 2049 single-byte chars). */
export const DXF_COMMENT_CHUNK = 2000;
/** Text style with an SHX big font so AutoCAD renders Chinese instead of `?`. */
export const DXF_TEXT_STYLE = 'STUDIO_CN';
export const DXF_SAVED_BY = 'Zhujian Studio';
const cad = ([x,y]:Point) => point3d(x,-y,0);
const degrees = (radians:number) => ((-radians*180/Math.PI)%360+360)%360;

function writeEntity(target:DxfBlock,entity:DrawingEntity){
  const options={layerName:entity.layer};
  if(entity.kind==='polyline'){
    if(entity.points.length===2&&!entity.closed)target.addLine(cad(entity.points[0]),cad(entity.points[1]),options);
    else target.addLWPolyline(entity.points.map(([x,y])=>({point:{x,y:-y}})),{...options,flags:entity.closed?LWPolylineFlags.Closed:LWPolylineFlags.None});
  }else if(entity.kind==='arc')target.addArc(cad(entity.center),entity.radius,
    degrees(entity.clockwise?entity.end:entity.start),degrees(entity.clockwise?entity.start:entity.end),options);
  else if(entity.kind==='circle')target.addCircle(cad(entity.center),entity.radius,options);
  // ELLIPSE group code 11 is the major-axis endpoint relative to the centre.
  else if(entity.kind==='ellipse')target.addEllipse(cad(entity.center),point3d(entity.major[0],-entity.major[1],0),entity.ratio,0,2*Math.PI,options);
  else target.addText(cad(entity.point),entity.height,entity.text.replace(/[\r\n]/g,' '),{...options,
    rotation:((-entity.rotation)%360+360)%360,horizontalAlignment:TextHorizontalAlignment.Center,
    verticalAlignment:TextVerticalAlignment.Middle,secondAlignmentPoint:cad(entity.point)}).textStyle=DXF_TEXT_STYLE;
}
// DXF flag 32 declares an exclusive anonymous display block for this dimension.
class DisplayBlockDimension extends AlignedDimension {
  constructor(first: ReturnType<typeof point3d>, second: ReturnType<typeof point3d>, options: ConstructorParameters<typeof AlignedDimension>[2]) {
    super(first, second, options);
    this.dimensionType |= 32;
  }
}
/** The library hard-codes layer lineweight (group 370) to 0; rewrite that one tag with the layer's lineweight. */
function setLayerLineweight(layer:DxfLayer,lineweight:number){
  const write=layer.dxfy.bind(layer);
  layer.dxfy=dx=>write(new Proxy(dx,{get(target,key){
    if(key==='push')return (code:number,value:unknown)=>target.push(code,code===370?lineweight:value as never);
    const member=Reflect.get(target,key,target);
    return typeof member==='function'?member.bind(target):member;
  }}));
}
/** Leading 999 comment lines: marker, chunk count, then the base64 payload in chunks. */
function payloadComments(payload:string){
  const chunks=payload.match(new RegExp(`.{1,${DXF_COMMENT_CHUNK}}`,'g'))||[];
  return [`${PAYLOAD_MARKER} ${chunks.length}`,...chunks].map(line=>`999\n${line}\n`).join('');
}
export function serializeDxf(document:DrawingDocument,payload?:string):string{
  const writer=new DxfWriter();writer.setUnits(Units.Millimeters);
  writer.setVariable('$MEASUREMENT',{70:1});writer.setVariable('$DWGCODEPAGE',{3:'ANSI_1252'});
  writer.setVariable('$LASTSAVEDBY',{1:DXF_SAVED_BY});writer.setVariable('$LWDISPLAY',{290:1});
  const textStyle=writer.tables.addStyle(DXF_TEXT_STYLE);
  textStyle.fontFileName='simplex.shx';textStyle.bigFontFileName='gbcbig.shx';
  writer.setVariable('$EXTMIN',{10:document.bounds.x,20:-document.bounds.y2,30:0});
  writer.setVariable('$EXTMAX',{10:document.bounds.x2,20:-document.bounds.y,30:0});
  writer.addLType('DASHED','__ __ __',DXF_DASHED_PATTERN);
  for(const [name,style] of Object.entries(DXF_LAYER_STYLES) as [DxfLayerName,typeof DXF_LAYER_STYLES[DxfLayerName]][])
    setLayerLineweight(writer.addLayer(name,style.color,style.lineType==='DASHED'?'DASHED':'Continuous'),style.lineweight);
  const style=writer.addDimStyle('STUDIO_METERS');
  Object.assign(style,{DIMTXT:180,DIMASZ:120,DIMTSZ:60,DIMEXO:35,DIMEXE:120,DIMLFAC:0.001,DIMDEC:2,DIMLUNIT:2,DIMPOST:'<> m',DIMGAP:90,DIMTAD:1,DIMTMOVE:1,DIMZIN:0});
  for(const block of document.blocks){
    const target=writer.blocks.addBlock(block.name,writer.document.objects,false);
    for(const entity of block.entities)writeEntity(target,entity);
  }
  const inserted=new Set(document.inserts.map(insert=>insert.groupId));
  for(const e of document.entities){
    // 图块代替了几何；文字不进块，按可读角度写在模型空间。
    if(e.group&&inserted.has(e.group.id)&&e.kind!=='text')continue;
    if(e.layer==='WALLS'&&e.kind==='polyline'&&e.closed&&e.points.length>2){
      const boundary=new HatchBoundaryPaths();
      boundary.addPolylineBoundary(new HatchPolylineBoundary(e.points.map(([x,y])=>vertex(x,-y))));
      writer.modelSpace.addHatch(boundary,pattern({name:HatchPredefinedPatterns.SOLID}),{layerName:DXF_WALL_HATCH_LAYER});
    }
    writeEntity(writer.modelSpace,e);
  }
  for(const insert of document.inserts)
    writer.modelSpace.addInsert(insert.block,cad(insert.point),{layerName:insert.layer,rotationAngle:degrees(insert.rotation)});
  document.dimensions.forEach((dim,index)=>{
    const block=writer.blocks.addBlock(`*D${index+1}`,writer.document.objects,false);block.flags=BlockFlags.AnonymousBlock;
    for(const entity of dim.display)writeEntity(block,entity);
    writer.modelSpace.addEntity(new DisplayBlockDimension(cad(dim.first),cad(dim.second),{layerName:dim.layer,blockName:block.name,
      definitionPoint:cad(dim.lineSecond),middlePoint:cad(dim.label),styleName:'STUDIO_METERS',
      ActualMeasurement:dim.measurement,rotation:((-dim.rotation)%360+360)%360}));
  });
  return (payload?payloadComments(payload):'')+writer.stringify();
}
