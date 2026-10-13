/**
 * 页面即将被隐藏 / 回收时的统一通知（iOS 切后台、微信切走都只保证 pagehide 或 visibilitychange）。
 * 分两个阶段按顺序执行：先 flush（把输入框里未提交的修改并入设计），再 persist（立即保存），
 * 与各组件注册的先后无关。
 */
export type PageHidePhase = "flush" | "persist";

const handlers: Record<PageHidePhase, Set<() => void>> = { flush: new Set(), persist: new Set() };
let detach: (() => void) | null = null;

function fire() {
  for (const phase of ["flush", "persist"] as const)
    for (const handler of [...handlers[phase]]) {
      try {
        handler();
      } catch (error) {
        console.error("页面隐藏处理失败", error);
      }
    }
}

function attach() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const visibility = () => {
    if (document.visibilityState === "hidden") fire();
  };
  window.addEventListener("pagehide", fire);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("pagehide", fire);
    document.removeEventListener("visibilitychange", visibility);
  };
}

/** 注册页面隐藏回调，返回取消注册函数（可直接作为 useEffect 的清理函数）。 */
export function onPageHide(handler: () => void, phase: PageHidePhase): () => void {
  handlers[phase].add(handler);
  detach ??= attach();
  return () => {
    handlers[phase].delete(handler);
    if (!handlers.flush.size && !handlers.persist.size) {
      detach?.();
      detach = null;
    }
  };
}
