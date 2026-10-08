import type { Design, Opening, Point } from './types';
export type DoorOrientation = Pick<Opening, 'hinge' | 'swingSide'>;
export function doorOrientation(door: DoorOrientation) {
  const hinge = door.hinge ?? 'start';
  const swingSide = door.swingSide ?? -1;
  const mirrorX = hinge === 'start' ? 1 : -1;
  const mirrorY = -swingSide;
  return { hinge, swingSide, mirrorX, mirrorY, rotationSign: mirrorX * mirrorY };
}
export function doorSwingPoints(door: Opening): Point[] {
  const { mirrorX, mirrorY } = doorOrientation(door);
  return Array.from({ length: 13 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 24;
    return [mirrorX * (-door.width / 2 + door.width * Math.cos(angle)), mirrorY * door.width * Math.sin(angle)] as Point;
  });
}
export function changeDoorOrientation(design: Design, id: string, patch: DoorOrientation): Design {
  return { ...design, openings: design.openings.map(door => door.id === id && door.kind === 'door' ? { ...door, ...patch } : door) };
}
