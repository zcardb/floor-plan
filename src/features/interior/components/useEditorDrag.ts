import { useRef, type RefObject, type PointerEvent, type KeyboardEvent, type MouseEvent } from 'react';
export interface EditorPosition { x: number; y: number }
export function clampEditorPosition(point: EditorPosition, viewport: { width: number; height: number }, size: { width: number; height: number }): EditorPosition {
  return { x: Math.max(0, Math.min(Math.max(0, viewport.width - size.width), point.x)), y: Math.max(0, Math.min(Math.max(0, viewport.height - size.height), point.y)) };
}
/**
 * 浮层拖动。默认按下即拖（用于专门的把手）；
 * 传 `threshold` 时整块浮层都能拖：移动超过阈值才进入拖动，里面的按钮照常点击，
 * 拖动结束后紧跟的那次 click 会被吞掉，避免松手时误触按钮。
 */
export function useEditorDrag(node: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, closePanels: () => void, { threshold = 0 }: { threshold?: number } = {}) {
  const manual = useRef<EditorPosition | null>(null), current = useRef<EditorPosition>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: EditorPosition; active: boolean } | null>(null);
  const dragged = useRef(false);
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
  const begin = (event: PointerEvent<HTMLElement>) => {
    drag.current!.active = true;
    closePanels();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute('data-dragging', 'true');
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    dragged.current = drag.current.active && threshold > 0;
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { place, manual, handlers: {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      dragged.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...current.current }, active: false };
      if (threshold > 0) return;
      event.preventDefault(); event.stopPropagation();
      begin(event);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (!active.active) {
        // 按下后在外面松开、没收到 pointerup 的残留状态：不再响应
        if (!(event.buttons & 1)) { drag.current = null; return; }
        if (Math.hypot(dx, dy) < threshold) return;
        begin(event);
      }
      event.stopPropagation();
      manual.current = clamp({ x: active.start.x + dx, y: active.start.y + dy });
      apply(manual.current);
    },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end,
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault(); event.stopPropagation();
    },
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
