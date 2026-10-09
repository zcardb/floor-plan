/**
 * Pointer Lock 在 iOS Safari / 微信内置浏览器里完全不存在，
 * 而 PointerLockControls.unlock() 会直接调用 document.exitPointerLock()，
 * 在这些浏览器上会抛 "exitPointerLock is not a function" 并让整个 3D 页面崩溃。
 * 所以只有在确实锁定、且浏览器支持时才真正解锁。
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

/**
 * 请求指针锁定。浏览器不支持、iframe 沙箱拒绝、用户拒绝时都返回 false，从不抛异常。
 * 旧版浏览器的 requestPointerLock 不返回 Promise，此时以同步调用成功为准。
 */
export async function tryPointerLock(el: Element | null | undefined): Promise<boolean> {
  const request = (el as { requestPointerLock?: unknown } | null | undefined)?.requestPointerLock;
  if (!el || typeof request !== "function") return false;
  try {
    await request.call(el);
    return true;
  } catch {
    return false;
  }
}
