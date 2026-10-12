import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { notify } from "@/lib/notify";
import { onPageHide } from "@/lib/platform";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { validateDesign } from "../model/validation";
import { nextGuestEditCount } from "../model/templateState";
import { uid, type Design, type Project } from "../model/types";
import { purgeRecoveryCopies, readGuestDefault, readGuests, writeGuests, writeGuestDefault } from "./guestStore";
import { TEMPLATE_PRESETS, presetById } from '../data/templates';
import { builtinProject, isBuiltinId, isPresetId } from '../data/templatePresets';
import { compactThumbnail, type ThumbnailDesign } from '../model/planThumbnail';
export type SaveStatusKind = "saved" | "saving" | "dirty" | "error" | "conflict";
export interface SaveStatus {
  kind: SaveStatusKind;
  label: string;
}
const STATUS = {
  local: { kind: "saved", label: "本机已保存" },
  localFailed: { kind: "error", label: "本机保存失败" },
  saving: { kind: "saving", label: "正在云端保存…" },
  cloud: { kind: "saved", label: "云端已保存" },
  cloudFailed: { kind: "error", label: "云端保存失败" },
  conflict: { kind: "conflict", label: "版本冲突，请另存" },
  dirty: { kind: "dirty", label: "有待保存更改" },
} as const satisfies Record<string, SaveStatus>;
/** 保存状态是否需要用户处理（失败或冲突）。 */
export const isSaveProblem = (status: SaveStatus) =>
  status.kind === "error" || status.kind === "conflict";
/** 把抛出的网络异常归一成 { error }，调用方只需处理一种失败形态，loading 不会卡死。 */
async function attempt<T extends { data: unknown; error: unknown }>(
  request: PromiseLike<T>,
): Promise<T | { data: null; error: Error }> {
  try {
    return await request;
  } catch (cause) {
    return {
      data: null,
      error: cause instanceof Error ? cause : new Error("网络异常，请重试"),
    };
  }
}
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  cloud?: boolean;
  /** 系统自带的本机默认方案：不可重命名、不可删除，只能复制。 */
  system?: boolean;
  builtin?: boolean;
  templateId?: string;
  /** 云端项目最近一次保存时留下的瘦身平面图；缺失时卡片显示占位。 */
  thumbnail?: ThumbnailDesign | null;
}
export function useProjects() {
  const confirm = useConfirm();
  const [guests, setGuests] = useState(readGuests),
    [session, setSession] = useState<Session | null>(null),
    [active, setActive] = useState<Project | null>(() => readGuestDefault()),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState<SaveStatus>(STATUS.local),
    [signingOut, setSigningOut] = useState(false),
    /** 正在打开某个云端项目。 */
    [loading, setLoading] = useState(false),
    /** 游客模式下对当前方案的编辑次数：0 表示还没改动过模版，顶部提示条据此出现。 */
    [guestEdits, setGuestEdits] = useState(0);
  const sessionRef = useRef(session),
    activeRef = useRef(active),
    guestsRef = useRef(guests),
    epoch = useRef(0),
    dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saving = useRef<Promise<boolean> | null>(null),
    editVersion = useRef(0),
    signOutLock = useRef(false);
  sessionRef.current = session;
  activeRef.current = active;
  guestsRef.current = guests;
  const persist = useCallback((ps: Project[]) => {
    // 先写存储，成功了才更新界面状态：否则会出现「界面删了、刷新又回来」。
    const result = writeGuests(ps);
    if ("cause" in result) {
      setStatus(STATUS.localFailed);
      notify.error("本机存储空间不足，请导出 JSON 保留方案", result.cause);
      return false;
    }
    setGuests(ps);
    guestsRef.current = ps;
    setStatus(STATUS.local);
    return true;
  }, []);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      const old = sessionRef.current?.user.id;
      if (old !== s?.user.id) {
        epoch.current++;
        if (timer.current) clearTimeout(timer.current);
        dirty.current = false;
        setLoading(false);
        const guest = readGuestDefault(); activeRef.current = guest; setActive(guest);
        setStatus(STATUS.local);
        setGuestEdits(0);
      }
      sessionRef.current = s;
      setSession(s);
      setReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) notify.error("登录状态恢复失败", error);
      setReady(true);
      if (data.session && !sessionRef.current) {
        sessionRef.current = data.session;
        setSession(data.session);
      }
    });
    const invalidate = () => {
      epoch.current++;
    };
    return () => {
      subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      invalidate();
    };
  }, []);
  useEffect(() => {
    // 顺带清掉历史版本写入的本机恢复副本死数据。
    purgeRecoveryCopies();
    if (!writeGuests(guestsRef.current).ok) setStatus(STATUS.localFailed);
  }, []);
  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (saving.current) {
      const success = await saving.current;
      if (!success) return false;
      if (dirty.current) return save();
      return true;
    }
    const p = activeRef.current;
    if (!p || p.builtin || isBuiltinId(p.id)) return true;
    if (!p.cloud) {
      if (!sessionRef.current) { const result = writeGuestDefault(p); if (!result.ok) { setStatus(STATUS.localFailed); notify.fail('本机保存失败，请下载备份'); } return result.ok; }
      return persist(guestsRef.current);
    }
    if (!dirty.current) return true;
    const s = sessionRef.current;
    if (!s) return false;
    const generation = epoch.current,
      version = editVersion.current;
    setStatus(STATUS.saving);
    const work = (async () => {
      const thumbnail = compactThumbnail(p.state);
      const { data, error } = await attempt(supabase
        .from("interior_design_projects")
        .update({
          name: p.name,
          state: p.state as unknown as Json,
          thumbnail: thumbnail as unknown as Json,
          revision: p.revision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .eq("revision", p.revision)
        .select("id,revision,updated_at")
        .maybeSingle());
      if (generation !== epoch.current) return false;
      if (error || !data) {
        setStatus(error ? STATUS.cloudFailed : STATUS.conflict);
        if (error) notify.error("云端保存失败，请检查网络后重试", error);
        else notify.fail("项目已在其它窗口修改，请另存新项目以保留当前设计");
        return false;
      }
      const next = {
        ...activeRef.current!,
        revision: data.revision,
        updatedAt:
          version === editVersion.current
            ? data.updated_at || ""
            : activeRef.current!.updatedAt,
      };
      activeRef.current = next;
      setActive(next);
      dirty.current = version !== editVersion.current;
      setStatus(dirty.current ? STATUS.dirty : STATUS.cloud);
      return true;
    })();
    saving.current = work;
    const success = await work;
    saving.current = null;
    if (success && dirty.current) {
      timer.current = setTimeout(() => void save(), 500);
    }
    return success;
  }, [persist]);
  // 微信 / Safari 切走后页面可能直接被系统回收：有排队中的云端保存就立刻执行，不再等防抖。
  // 正在保存时不重复发起，保存结束后若仍有改动会自行续存。
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => onPageHide(() => {
    if (!timer.current || saving.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void saveRef.current();
  }, "persist"), []);
  const update = useCallback(
    (design: Design) => {
      const p = activeRef.current;
      if (!p || p.builtin || isBuiltinId(p.id)) return;
      const next = { ...p, state: design, updatedAt: new Date().toISOString() };
      activeRef.current = next;
      setActive(next);
      editVersion.current++;
      if (p.cloud) {
        dirty.current = true;
        setStatus(STATUS.dirty);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 1000);
      } else if (!sessionRef.current) {
        // 回到初始模版（重置方案、一路撤销回起点）计数归零，顶部提示条随之消失。
        setGuestEdits((n) => nextGuestEditCount(n, design));
        setStatus(writeGuestDefault(next).ok ? STATUS.local : STATUS.localFailed);
      } else persist(guestsRef.current.map((r) => (r.id === p.id ? next : r)));
    },
    [persist, save],
  );
  const open = useCallback(
    async (p: ProjectSummary) => {
      if (!(await save())) return false;
      const templateId = p.builtin || isBuiltinId(p.id) ? p.templateId ?? p.id.slice('builtin-template:'.length) : undefined;
      if (templateId && isPresetId(templateId)) {
        const preset = presetById(templateId)!;
        const next = sessionRef.current ? builtinProject(preset) : readGuestDefault(templateId);
        if (!sessionRef.current && !writeGuestDefault(next).ok) { setStatus(STATUS.localFailed); return false; }
        epoch.current++; dirty.current = false;
        activeRef.current = next; setActive(next); setGuestEdits(nextGuestEditCount(0, next.state));
        setStatus(sessionRef.current ? { kind: 'saved', label: '内置模板 · 只读' } : STATUS.local);
        return true;
      }
      if (!sessionRef.current) return false;
      const generation = ++epoch.current;
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      if (!p.cloud) {
        const found = guestsRef.current.find((r) => r.id === p.id);
        if (found) {
          activeRef.current = found;
          setActive(found);
          setStatus(STATUS.local);
          return true;
        }
        return false;
      }
      setLoading(true);
      const { data, error } = await attempt(supabase
        .from("interior_design_projects")
        .select("*")
        .eq("id", p.id)
        .maybeSingle());
      if (generation !== epoch.current) return false;
      setLoading(false);
      if (error || !data) {
        notify.error("项目加载失败", error ?? "项目不存在或无访问权限");
        return false;
      }
      try {
        const found: Project = {
          id: data.id,
          name: data.name,
          state: validateDesign(data.state),
          revision: data.revision,
          updatedAt: data.updated_at || "",
          cloud: true,
        };
        activeRef.current = found;
        setActive(found);
        setStatus(STATUS.cloud);
        return true;
      } catch (cause) {
        notify.error("项目数据不完整，请导入备份", cause);
        return false;
      }
    },
    [save],
  );
  /** 只凭 id 打开项目（来自 URL）：内置模板、本机项目、云端项目依次判断。 */
  const openById = useCallback(
    (id: string) =>
      open({ id, name: "", updatedAt: "", revision: 0, cloud: !guestsRef.current.some((r) => r.id === id) }),
    [open],
  );
  /** 当前项目的即时值：异步操作刚完成、界面还没重新渲染时也能读到最新结果。 */
  const current = useCallback(() => activeRef.current, []);
  const create = useCallback(
    async (p: Project, toCloud = false) => {
      if (!sessionRef.current) return false;
      const saved = await save();
      if (!saved) {
        const keep =
          dirty.current &&
          (await confirm({
            title: "云端保存失败",
            description: "当前设计未能保存到云端，将其另存为新项目以保留更改？",
            confirmText: "另存为新项目",
          }));
        if (!keep) return false;
      }
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const generation = epoch.current;
      const next = {
        ...p,
        id: uid(),
        revision: 0,
        updatedAt: new Date().toISOString(),
        cloud: toCloud,
        // 复制/新建/导入出来的项目都属于「用户新建」：必须三操作齐全，不能继承来源的系统标记。
        system: false,
        builtin: false,
      };
      if (toCloud) {
        if (!sessionRef.current) {
          notify.fail("请先登录");
          return false;
        }
        const thumbnail = compactThumbnail(next.state);
        const { error } = await attempt(supabase
          .from("interior_design_projects")
          .insert({
            id: next.id,
            name: next.name,
            state: next.state as unknown as Json,
            schema_version: 2,
            thumbnail: thumbnail as unknown as Json,
          }));
        if (generation !== epoch.current) return false;
        if (error) {
          notify.error("创建云端项目失败", error);
          return false;
        }
        setStatus(STATUS.cloud);
      } else persist([next, ...guestsRef.current]);
      epoch.current++;
      dirty.current = false;
      activeRef.current = next;
      setActive(next);
      return true;
    },
    [confirm, persist, save],
  );
  const saveGuestToCloud = useCallback(async (): Promise<boolean> => {
    const p = activeRef.current;
    if (!sessionRef.current || !p || p.cloud || p.builtin) return false;
    const next: Project = {
      ...p,
      id: uid(),
      name: "修改的第一个版本",
      revision: 0,
      updatedAt: new Date().toISOString(),
      cloud: true,
      system: false,
    };
    const thumbnail = compactThumbnail(next.state);
    const { error } = await attempt(supabase
      .from("interior_design_projects")
      .insert({
        id: next.id,
        name: next.name,
        state: next.state as unknown as Json,
        schema_version: 2,
        thumbnail: thumbnail as unknown as Json,
      }));
    if (error) {
      notify.error("保存到云端失败", error);
      return false;
    }
    epoch.current++;
    dirty.current = false;
    activeRef.current = next;
    setActive(next);
    setStatus(STATUS.cloud);
    notify.success("已保存到云端项目「" + next.name + "」");
    return true;
  }, []);
  const remove = useCallback(
    async (p: ProjectSummary) => {
      if (!sessionRef.current || p.builtin || isBuiltinId(p.id) || p.system) return false;
      // 只有删掉正在编辑的项目才需要先落盘；删别的项目不该被当前项目的保存状态拦住。
      if (activeRef.current?.id === p.id && !(await save())) {
        notify.fail("当前项目还有未保存的改动，已取消删除");
        return false;
      }
      const generation = epoch.current;
      if (p.cloud) {
        const { data, error } = await attempt(supabase
          .from("interior_design_projects")
          .delete()
          .eq("id", p.id)
          .select("id")
          .maybeSingle());
        if (generation !== epoch.current) return false;
        if (error) {
          notify.error("删除项目「" + p.name + "」失败", error);
          return false;
        }
        if (!data) {
          notify.fail("没有权限删除项目「" + p.name + "」，它仍在云端");
          return false;
        }
      } else if (!persist(guestsRef.current.filter((r) => r.id !== p.id))) {
        return false; // persist 已提示本机存储写入失败，列表保持原样
      }
      if (activeRef.current?.id === p.id) {
        epoch.current++;
        dirty.current = false;
        const next = guestsRef.current[0] || null;
        activeRef.current = next;
        setActive(next);
        setStatus(STATUS.local);
      }
      notify.success("已删除项目「" + p.name + "」");
      return true;
    },
    [persist, save],
  );
  const rename = useCallback(
    async (p: ProjectSummary, name: string) => {
      if(!sessionRef.current || p.builtin || isBuiltinId(p.id) || p.system)return false;
      const generation=epoch.current;
      name = name.trim();
      if (!name || name.length > 100) { notify.fail("项目名称需为 1～100 个字符"); return false; }
      if (!(await save())) return false;
      if (p.cloud) {
        const { data, error } = await attempt(supabase
          .from("interior_design_projects")
          .update({
            name,
            revision: p.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id)
          .eq("revision", p.revision)
          .select("revision")
          .maybeSingle());
        if(generation!==epoch.current)return false;
        if (error || !data) {
          notify.error("重命名失败", error ?? "项目版本已变化，请重新加载后重试");
          return false;
        }
        if (activeRef.current?.id === p.id) {
          const next = { ...activeRef.current, name, revision: data.revision };
          activeRef.current = next;
          setActive(next);
        }
      } else {
        persist(
          guestsRef.current.map((r) => (r.id === p.id ? { ...r, name } : r)),
        );
        if (activeRef.current?.id === p.id) {
          const next = { ...activeRef.current, name };
          activeRef.current = next;
          setActive(next);
        }
      }
      notify.success("已重命名为「" + name + "」");
      return true;
    },
    [persist, save],
  );
  const duplicate = useCallback(
    async (p: ProjectSummary) => {
      if (p.builtin || isBuiltinId(p.id)) return false;
      if (!(await open(p))) return false;
      const current = activeRef.current;
      if (!current) return false;
      const name = current.name + " · 副本";
      if (!(await create({ ...current, name }, !!p.cloud))) return false;
      notify.success("已复制为「" + name + "」");
      return true;
    },
    [open, create],
  );
  const signOut = async (): Promise<boolean> => {
    if (signOutLock.current) return false;
    signOutLock.current = true;
    setSigningOut(true);
    try {
      if (!(await save())) {
        notify.fail("当前设计尚未保存成功，已取消退出登录");
        return false;
      }
      const { error } = await attempt(
        supabase.auth.signOut().then(({ error }) => ({ data: null, error })),
      );
      if (error) {
        notify.error("退出登录失败", error);
        return false;
      }
      notify.success("已退出登录");
      return true;
    } finally {
      signOutLock.current = false;
      setSigningOut(false);
    }
  };
  return {
    guests,
    builtins: TEMPLATE_PRESETS.map(p => ({ id: 'builtin-template:' + p.id, name: p.name, revision: 0, updatedAt: '', builtin: true, templateId: p.id })),
    active,
    session,
    ready,
    status,
    loading,
    guestEdits,
    update,
    save,
    open,
    openById,
    current,
    create,
    remove,
    rename,
    duplicate,
    saveGuestToCloud,
    signOut,
    signingOut,
  };
}
