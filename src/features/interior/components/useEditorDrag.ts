import { useRef, type RefObject, type PointerEvent, type KeyboardEvent } from 'react';
export interface EditorPosition { x: number; y: number }
export function clampEditorPosition(point: EditorPosition, viewport: { width: number; height: number }, size: { width: number; height: number }): EditorPosition {
  return { x: Math.max(0, Math.min(Math.max(0, viewport.width - size.width), point.x)), y: Math.max(0, Math.min(Math.max(0, viewport.height - size.height), point.y)) };
}
export function useEditorDrag(node: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, closePanels: () => void) {
  const manual = useRef<EditorPosition | null>(null), current = useRef<EditorPosition>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: EditorPosition } | null>(null);
  const clamp = (point: EditorPosition) => stage.current && node.current ? clampEditorPosition(point, { width: stage.current.clientWidth, height: stage.current.clientHeight }, { width: node.current.offsetWidth, height: node.current.offsetHeight }) : point;
  const apply = (point: EditorPosition) => {
    current.current = clamp(point);
    if (node.current) node.current.style.transform = `translate3d(${current.current.x}px,${current.current.y}px,0)`;
  };
  /** 未手动拖过时放到 automatic；拖过之后保持手动位置（随画布尺寸重新限制）。 */
  const place = (automatic: EditorPosition) => {
    const point = manual.current ? clamp(manual.current) : automatic;
    if (manual.current) manual.current = point;
    apply(point);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { place, manual, handlers: {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); closePanels();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...current.current } };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.setAttribute('data-dragging', 'true');
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      event.stopPropagation();
      manual.current = clamp({ x: active.start.x + event.clientX - active.x, y: active.start.y + event.clientY - active.y });
      apply(manual.current);
    },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end,
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
      const delta = moves[event.key];
      if (!delta) return;
      event.preventDefault(); event.stopPropagation(); closePanels();
      manual.current = clamp({ x: current.current.x + delta[0], y: current.current.y + delta[1] });
      apply(manual.current);
    },
  } };
}
