import { AlignedDimension, BlockFlags, DxfWriter, LWPolylineFlags, TextHorizontalAlignment, TextVerticalAlignment, Units, point3d } from '@tarikjabiri/dxf';
import type { DxfBlock } from '@tarikjabiri/dxf';
import type { DrawingDocument, DrawingEntity } from './drawingDocument';
import type { Point } from './types';
const cad = ([x,y]:Point) => point3d(x,-y,0);
const degrees = (radians:number) => ((-radians*180/Math.PI)%360+360)%360;

function writeEntity(target:DxfBlock,entity:DrawingEntity){
  const options={layerName:entity.layer};
  if(entity.kind==='polyline'){
    if(entity.points.length===2&&!entity.closed)target.addLine(cad(entity.points[0]),cad(entity.points[1]),options);
    else target.addLWPolyline(entity.points.map(([x,y])=>({point:{x,y:-y}})),{...options,flags:entity.closed?LWPolylineFlags.Closed:LWPolylineFlags.None});
  }else if(entity.kind==='arc')target.addArc(cad(entity.center),entity.radius,
    degrees(entity.clockwise?entity.end:entity.start),degrees(entity.clockwise?entity.start:entity.end),options);
  else target.addText(cad(entity.point),entity.height,entity.text.replace(/[\r\n]/g,' '),{...options,
    rotation:((-entity.rotation)%360+360)%360,horizontalAlignment:TextHorizontalAlignment.Center,
    verticalAlignment:TextVerticalAlignment.Middle,secondAlignmentPoint:cad(entity.point)});
}
// DXF flag 32 declares an exclusive anonymous display block for this dimension.
class DisplayBlockDimension extends AlignedDimension {
  constructor(first: ReturnType<typeof point3d>, second: ReturnType<typeof point3d>, options: ConstructorParameters<typeof AlignedDimension>[2]) {
    super(first, second, options);
    this.dimensionType |= 32;
  }
}
export function serializeDxf(document:DrawingDocument):string{
  const writer=new DxfWriter();writer.setUnits(Units.Millimeters);
  writer.setVariable('$MEASUREMENT',{70:1});writer.setVariable('$DWGCODEPAGE',{3:'UTF-8'});
  writer.setVariable('$EXTMIN',{10:document.bounds.x,20:-document.bounds.y2,30:0});
  writer.setVariable('$EXTMAX',{10:document.bounds.x2,20:-document.bounds.y,30:0});
  for(const layer of ['WALLS','DEMOLISHED','ROOMS','OPENINGS','FURNITURE','ROOM_LABELS','DIMENSIONS','MEASURES'])writer.addLayer(layer,7,'CONTINUOUS');
  const style=writer.addDimStyle('STUDIO_METERS');
  Object.assign(style,{DIMTXT:180,DIMASZ:120,DIMTSZ:60,DIMEXO:35,DIMEXE:120,DIMLFAC:0.001,DIMDEC:2,DIMLUNIT:2,DIMPOST:'<> m',DIMGAP:90,DIMTAD:1,DIMTMOVE:1,DIMZIN:0});
  for(const e of document.entities)writeEntity(writer.modelSpace,e);
  document.dimensions.forEach((dim,index)=>{
    const block=writer.blocks.addBlock(`*D${index+1}`,writer.document.objects,false);block.flags=BlockFlags.AnonymousBlock;
    for(const entity of dim.display)writeEntity(block,entity);
    writer.modelSpace.addEntity(new DisplayBlockDimension(cad(dim.first),cad(dim.second),{layerName:dim.layer,blockName:block.name,
      definitionPoint:cad(dim.lineSecond),middlePoint:cad(dim.label),styleName:'STUDIO_METERS',
      ActualMeasurement:dim.measurement,rotation:((-dim.rotation)%360+360)%360}));
  });
  return writer.stringify();
}
