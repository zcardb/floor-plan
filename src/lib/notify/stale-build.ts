import { toast } from "sonner";

/**
 * 网站重新发布后，已打开的页面还引用旧版本的按需模块（文件名带哈希），服务器上已不存在，
 * 于是导出、3D、各类弹窗在第一次打开时会报「Failed to fetch dynamically imported module」。
 * 这类错误重试无用，只能刷新页面拿到新版本；这里统一识别并给出可操作的提示。
 */
const STALE_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

export function isStaleBuildError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return STALE_PATTERNS.some(pattern => pattern.test(message));
}

/** 同一时间只显示一条更新提示；不自动刷新，避免丢掉未保存的修改。 */
export function notifyStaleBuild() {
  toast.warning("网站已更新，需要刷新页面", {
    id: "stale-build",
    description: "刚才的操作没有执行。有未保存的修改请先保存，再刷新页面。",
    duration: Infinity,
    action: { label: "刷新页面", onClick: () => window.location.reload() },
  });
}

/** 兜底：没有被调用方捕获的按需模块加载失败（如 React.lazy 弹窗）也给出同样的提示。 */
export function installStaleBuildHandler() {
  window.addEventListener("vite:preloadError", event => {
    if (isStaleBuildError((event as Event & { payload?: unknown }).payload)) notifyStaleBuild();
  });
}
