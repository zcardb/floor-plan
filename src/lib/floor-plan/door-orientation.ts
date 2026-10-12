import type { Design, Opening } from './types';
export type DoorOrientation = Pick<Opening, 'hinge' | 'swingSide'>;
export function doorOrientation(door: DoorOrientation) {
  const hinge = door.hinge ?? 'start';
  const swingSide = door.swingSide ?? -1;
  const mirrorX = hinge === 'start' ? 1 : -1;
  const mirrorY = -swingSide;
  return { hinge, swingSide, mirrorX, mirrorY, rotationSign: mirrorX * mirrorY };
}
export function changeDoorOrientation(design: Design, id: string, patch: DoorOrientation): Design {
  return { ...design, openings: design.openings.map(door => door.id === id && door.kind === 'door' ? { ...door, ...patch } : door) };
}
