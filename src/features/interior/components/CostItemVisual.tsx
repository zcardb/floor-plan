import { DoorOpen, Grid2X2, Home, Layers, PanelTop, Paintbrush, Wallpaper, PanelsTopLeft } from 'lucide-react';
import type { CostEntry } from '../model/accountCostEntries';
import { FurnitureShape } from './FurnitureShape';
import { FloorSwatch } from './FloorSwatch';
function iconOf(entry: CostEntry) {
  if (entry.group === 'openingPrices') return (entry.opening?.kind ?? entry.key) === 'door' ? DoorOpen : PanelsTopLeft;
  if (entry.group === 'floorPrices') return entry.key === 'wood' ? Layers : Grid2X2;
  if (entry.group === 'roofPrices') return Home;
  if (entry.group === 'ceilingPrices') return PanelTop;
  return entry.key === 'paint' || entry.wall?.custom ? Paintbrush : Wallpaper;
}
export function CostItemVisual({ entry }: { entry: CostEntry }) {
  const item = entry.furniture;
  if (item) return item.imageUrl ? <img src={item.imageUrl} alt={item.name} crossOrigin="anonymous" loading="lazy" /> : <svg viewBox={`${-item.w/2-100} ${-item.d/2-100} ${item.w+200} ${item.d+200}`}><FurnitureShape f={item} /></svg>;
  if (entry.floor?.custom) return <span className="cost-material-visual"><FloorSwatch material={entry.floor} className="cost-floor-swatch" /><Grid2X2 size={38} strokeWidth={1.3} /></span>;
  const material = entry.group === 'floorPrices' ? entry.floor : entry.wall;
  const Icon = iconOf(entry);
  return <span className="cost-material-visual">{material && <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="8" fill={material.color} /></svg>}<Icon size={38} strokeWidth={1.3} /></span>;
}
