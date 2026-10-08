import { notify } from "@/lib/notify";
import { createProject } from "../data/templates";
import { validateDesign } from "../model/validation";
import type { Project } from "../model/types";

export const GUEST_KEY = "interior-guest-projects-v2";
export const GUEST_DEFAULT_KEY = "interior-guest-default-v1";
const RECOVERY_PREFIX = "interior-recovery-";

export type WriteResult = { ok: true } | { ok: false; cause: unknown };

/**
 * 读取本机方案列表。存储不可用时返回空列表：不凭空造出一份刷新后又出现、删不掉的项目。
 * 只有「首次运行（没有这个 key）」才播种一份参考户型方案。
 */
export function readGuests(): Project[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(GUEST_KEY);
  } catch (cause) {
    notify.error("本机存储不可用，本机方案列表无法读取", cause);
    return [];
  }
  if (!raw) return [createProject("reference")];
  try {
    const items = JSON.parse(raw) as Project[];
    if (!Array.isArray(items)) return [createProject("reference")];
    return items.map((p) => ({ ...p, state: validateDesign(p.state), cloud: false }));
  } catch (cause) {
    notify.error("本机项目读取失败，可通过 JSON 文件恢复", cause);
    return [createProject("reference")];
  }
}

/** 读取游客正在编辑的默认方案（不属于方案列表）。 */
export function readGuestDefault(): Project {
  try {
    const raw = localStorage.getItem(GUEST_DEFAULT_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      return { ...p, cloud: false, state: validateDesign(p.state) };
    }
  } catch { /* 读取失败时回落到新方案，不覆盖已有内容。 */ }
  return createProject("reference");
}

/** 只负责写存储并如实返回结果；调用方拿到 ok 之后才更新界面状态。 */
export function writeGuests(projects: Project[]): WriteResult {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(projects));
    return { ok: true };
  } catch (cause) {
    return { ok: false, cause };
  }
}

/** 清掉历史版本写入的本机恢复副本死数据（该机制已移除，只留占用的存储）。 */
export function purgeRecoveryCopies(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RECOVERY_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* 清理失败不影响使用。 */ }
}
