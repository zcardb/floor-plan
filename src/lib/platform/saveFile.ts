import { canDownloadDirectly, type PlatformEnv, browserEnv } from "./capabilities";

export type SaveResult =
  | { kind: "downloaded" }
  | { kind: "blocked"; blob: Blob; name: string };

/**
 * 整个项目唯一创建 <a download> 的地方。
 * 浏览器不能直接下载（微信内置浏览器）时返回 blocked，由调用方给出替代方案。
 */
export function saveFile(blob: Blob, name: string, env: PlatformEnv = browserEnv()): SaveResult {
  if (!canDownloadDirectly(env)) return { kind: "blocked", blob, name };
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { kind: "downloaded" };
}
