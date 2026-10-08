import { createDrawingDocument } from './drawingDocument';
import { serializeDxf } from './dxfExport';
import { serializeSvg } from './svgExport';
import type { Design, Layers } from './types';
export type DrawingFormat = 'dxf' | 'svg';
export function serializeDrawing(design:Design,layers:Layers,format:DrawingFormat){
  const drawing=createDrawingDocument(design,layers);
  return format==='dxf'?serializeDxf(drawing):serializeSvg(drawing);
}
export function downloadDrawing(design:Design,layers:Layers,format:DrawingFormat,name:string){
  const content=serializeDrawing(design,layers,format);
  const url=URL.createObjectURL(new Blob([content],{type:format==='svg'?'image/svg+xml;charset=utf-8':'application/dxf;charset=utf-8'}));
  try{const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[\\/:*?"<>|]/g,'-')}.${format}`;link.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
