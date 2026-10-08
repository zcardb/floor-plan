import { DoorOpen, Grid2X2, Layers, Paintbrush, Wallpaper, PanelsTopLeft } from 'lucide-react';
import { builtinFloors } from '../model/floorMaterials';
import { wallMaterials } from '../model/costs';
import type { CostEntry } from '../model/accountCostEntries';
import { FurnitureShape } from './FurnitureShape';
export function CostItemVisual({ entry }: { entry: CostEntry }) {
  const item = entry.furniture;
  if (item) return item.imageUrl ? <img src={item.imageUrl} alt={item.name} crossOrigin="anonymous" loading="lazy" /> : <svg viewBox={`${-item.w/2-100} ${-item.d/2-100} ${item.w+200} ${item.d+200}`}><FurnitureShape f={item} /></svg>;
  const material = entry.group === 'floorPrices' ? builtinFloors[entry.key] : entry.group === 'wallPrices' ? wallMaterials[entry.key] : null;
  const Icon = entry.group === 'openingPrices' ? entry.key === 'door' ? DoorOpen : PanelsTopLeft : entry.group === 'floorPrices' ? entry.key === 'wood' ? Layers : Grid2X2 : entry.key === 'paint' ? Paintbrush : Wallpaper;
  return <span className="cost-material-visual">{material && <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="8" fill={material.color} /></svg>}<Icon size={38} strokeWidth={1.3} /></span>;
}
