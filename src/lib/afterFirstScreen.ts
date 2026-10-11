/**
 * 首屏完成后再在浏览器空闲时执行 `run`：等 window load（页面资源下载完），
 * 再留出 `settleMs` 给首屏数据请求，最后挂到 requestIdleCallback。用于预加载非首屏模块（如 3D 引擎）。
 * 返回取消函数。
 */
export function afterFirstScreen(run: () => void, settleMs = 1500): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined, idle: number | undefined;
  const idleRun = () => {
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(run, { timeout: 5000 });
    else run();
  };
  const schedule = () => { timer = setTimeout(idleRun, settleMs); };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idle);
  };
}
