/** 指针移动超过这个距离（px）就算拖动，而不是单击。 */
export const DRAG_THRESHOLD = 4;

/**
 * 区分「拖动」与「单击」：挂在可点击容器里的 3D 预览上，拖动旋转后吞掉随后的 click，
 * 让拖动只旋转、单击才触发外层（例如选中候选）。返回解绑函数。
 */
export function guardDragClick(el: HTMLElement): () => void {
  let down: { x: number; y: number } | null = null, dragged = false;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; dragged = false; };
  const onMove = (e: PointerEvent) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD) dragged = true; };
  const onClick = (e: MouseEvent) => {
    if (dragged) { e.stopPropagation(); e.preventDefault(); }
    down = null;
    dragged = false;
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("click", onClick);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("click", onClick);
  };
}
