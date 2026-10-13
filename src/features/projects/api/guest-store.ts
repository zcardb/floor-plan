import { notify } from "@/lib/notify";
import { createProject } from "@/lib/floor-plan/templates";
import { validateDesign } from "@/lib/floor-plan/validation";
import type { Project } from "@/lib/floor-plan/types";

export const GUEST_KEY = "interior-guest-projects-v2";
export const GUEST_DEFAULT_KEY = "interior-guest-default-v2";
/** 已废弃的键：旧版原木之家默认方案（整圈承重墙）与「上次选择的模板」。 */
const LEGACY_KEYS = ["interior-guest-default-v1", "interior-guest-template-v1"];
const RECOVERY_PREFIX = "interior-recovery-";

export type WriteResult = { ok: true } | { ok: false; cause: unknown };

/** 系统自带的本机默认方案（＝自动播种的那份参考户型）。 */
export const systemProject = (): Project => ({
  ...createProject("reference"),
  system: true,
});

/**
 * 旧数据兜底：列表里一条系统标记都没有时，把更新时间最早的一条认作系统默认方案。
 * 播种的那份从未被就地编辑，用户后来自己建的本机副本一定更新，所以「最早」是可靠的兜底。
 */
function withSystemMarker(list: Project[]): Project[] {
  if (!list.length || list.some((p) => p.system === true)) return list;
  const oldest = list.reduce((a, b) =>
    (a.updatedAt || "") <= (b.updatedAt || "") ? a : b,
  );
  return list.map((p) => (p === oldest ? { ...p, system: true } : p));
}

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
  if (!raw) return [];
  try {
    const items = JSON.parse(raw) as Project[];
    if (!Array.isArray(items)) return [systemProject()];
    return withSystemMarker(
      items.map((p) => ({ ...p, state: validateDesign(p.state), cloud: false })),
    );
  } catch (cause) {
    notify.error("本机项目读取失败，可通过 JSON 文件恢复", cause);
    return [systemProject()];
  }
}

/** 读取游客正在编辑的默认方案（不属于方案列表）。打开应用时默认选中原木之家。 */
export const guestKeyFor = (id: string) => id === 'reference' ? GUEST_DEFAULT_KEY : `interior-guest-default-${id}`;
export function writeGuestDefault(project: Project): WriteResult {
  try {
    localStorage.setItem(guestKeyFor(project.state.templateId ?? 'reference'), JSON.stringify(project));
    return { ok: true };
  } catch (cause) { return { ok: false, cause }; }
}
export function readGuestDefault(templateId = 'reference'): Project {
  try {
    const raw = localStorage.getItem(guestKeyFor(templateId));
    if (raw) {
      const p = JSON.parse(raw) as Project;
      return { ...p, cloud: false, builtin: false, templateId, state: validateDesign(p.state) };
    }
  } catch { /* 读取失败时回落到新方案，不覆盖已有内容。 */ }
  return { ...createProject(templateId), templateId };
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

/** 清掉历史版本写入的本机恢复副本与已废弃键的死数据。 */
export function purgeRecoveryCopies(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RECOVERY_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* 清理失败不影响使用。 */ }
}
