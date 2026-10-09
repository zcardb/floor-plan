/**
 * Pointer Lock 在 iOS Safari / 微信内置浏览器里完全不存在，
 * 而 PointerLockControls.unlock() 会直接调用 document.exitPointerLock()，
 * 在这些浏览器上会抛 "exitPointerLock is not a function" 并让整个 3D 页面崩溃。
 * 所以这里只有在确实锁定、且浏览器支持时才真正解锁。
 */
export function releasePointerLock(walk: {
  isLocked: boolean;
  unlock: () => void;
  domElement?: HTMLElement | null;
}): void {
  if (!walk.isLocked) return;
  const doc = walk.domElement?.ownerDocument;
  if (typeof doc?.exitPointerLock !== "function") return;
  walk.unlock();
}
