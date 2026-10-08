import type { LibraryItem } from './types';

// Account price overrides belong to cost defaults, never to geometry writes.
export function furnitureGeometryPayload(edited: LibraryItem, stored: LibraryItem): LibraryItem {
  return { ...edited, price: stored.price };
}
