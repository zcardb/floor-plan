import type { LibraryItem } from '@/lib/floor-plan/types';

// Account price overrides belong to cost defaults, never to geometry writes.
export function furnitureGeometryPayload(edited: LibraryItem, stored: LibraryItem): LibraryItem {
  return { ...edited, price: stored.price };
}
