/**
 * 浏览器能力判断的唯一来源。业务代码不直接判断 UA、媒体查询或 Pointer Lock，
 * 统一调用这里（eslint 规则会拦截散落的写法）。
 * 每个函数都可传入 env，便于在没有 DOM 的测试环境中模拟各种浏览器。
 */
export interface PlatformEnv {
  userAgent?: string;
  matchMedia?: (query: string) => { matches: boolean };
  document?: { exitPointerLock?: unknown } | null;
}

const COARSE_QUERY = "(pointer: coarse)";

export function browserEnv(): PlatformEnv {
  if (typeof window === "undefined") return {};
  return {
    userAgent: window.navigator?.userAgent,
    matchMedia: typeof window.matchMedia === "function" ? (q) => window.matchMedia(q) : undefined,
    document: window.document,
  };
}

/** 主要输入是手指（手机、平板）。 */
export function isCoarsePointer(env: PlatformEnv = browserEnv()): boolean {
  return env.matchMedia?.(COARSE_QUERY).matches ?? false;
}

/** iOS Safari / 微信等浏览器完全没有 Pointer Lock API。 */
export function supportsPointerLock(env: PlatformEnv = browserEnv()): boolean {
  return typeof env.document?.exitPointerLock === "function";
}

/** 微信内置浏览器。 */
export function isWeChat(env: PlatformEnv = browserEnv()): boolean {
  return /MicroMessenger/i.test(env.userAgent ?? "");
}

/** 能否通过 <a download> 直接把文件存到本机；微信内置浏览器会吞掉下载。 */
export function canDownloadDirectly(env: PlatformEnv = browserEnv()): boolean {
  return !isWeChat(env);
}
