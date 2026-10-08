import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { errorMessage, notify } from "@/lib/notify";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createProject } from "../data/templates";
import { validateDesign } from "../model/validation";
import { uid, type Design, type Project } from "../model/types";
const KEY = "interior-guest-projects-v2";
const DEMO_KEY = 'interior-guest-default-v1';
function defaultGuest(): Project {
  try { const raw = localStorage.getItem(DEMO_KEY); if (raw) { const p = JSON.parse(raw) as Project; return {...p, cloud:false, state:validateDesign(p.state)}; } } catch { /* Preserve legacy storage independently. */ }
  return createProject('reference');
}
function initialProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const items = JSON.parse(raw) as Project[];
      return items.map((p) => ({
        ...p,
        state: validateDesign(p.state),
        cloud: false,
      }));
    }
  } catch (cause) {
    notify.error("本机项目读取失败，可通过 JSON 文件恢复", cause);
  }
  return [createProject("reference")];
}
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
  recovery: { kind: "dirty", label: "恢复副本待保存" },
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
}
export function useProjects() {
  const confirm = useConfirm();
  const [guests, setGuests] = useState(initialProjects),
    [session, setSession] = useState<Session | null>(null),
    [cloud, setCloud] = useState<ProjectSummary[]>([]),
    [active, setActive] = useState<Project | null>(defaultGuest),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState<SaveStatus>(STATUS.local),
    [listError, setListError] = useState(""),
    [signingOut, setSigningOut] = useState(false),
    [loading, setLoading] = useState(false),
    [listReady, setListReady] = useState(false),
    [hasMore, setHasMore] = useState(false);
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
    setGuests(ps);
    guestsRef.current = ps;
    try {
      localStorage.setItem(KEY, JSON.stringify(ps));
      setStatus(STATUS.local);
      return true;
    } catch (cause) {
      setStatus(STATUS.localFailed);
      notify.error("本机存储空间不足，请导出 JSON 保留方案", cause);
      return false;
    }
  }, []);
  const loadList = useCallback(
    async (more = false) => {
      if (!sessionRef.current) return;
      const generation = epoch.current;
      setLoading(true);
      setListError("");
      const start = more ? cloud.length : 0;
      let result;
      try {
        result = await supabase
          .from("interior_design_projects")
          .select("id,name,updated_at,revision")
          .order("updated_at", { ascending: false })
          .range(start, start + 19);
      } catch (cause) {
        if (generation !== epoch.current) return;
        setLoading(false); setListReady(true);
        setListError(errorMessage(cause, "请检查网络后重试"));
        notify.error("云端项目读取失败", cause);
        return;
      }
      if (generation !== epoch.current) return;
      const { data, error } = result;
      setLoading(false); setListReady(true);
      if (error) {
        setListError(error.message);
        notify.error("云端项目读取失败", error);
        return;
      }
      const list = data.map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updated_at || "",
        revision: r.revision,
        cloud: true,
      }));
      setCloud((c) => (more ? [...c, ...list] : list));
      setHasMore(data.length === 20);
    },
    [cloud.length],
  );
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      const old = sessionRef.current?.user.id;
      if (old !== s?.user.id) {
        epoch.current++;
        if (timer.current) clearTimeout(timer.current);
        dirty.current = false;
        setCloud([]);
        setListReady(false);
        setListError("");
        setLoading(false);
        const guest = defaultGuest(); activeRef.current = guest; setActive(guest);
        setStatus(STATUS.local);
      }
      sessionRef.current = s;
      setSession(s);
      setReady(true);
      if (s) setTimeout(() => void loadListRef.current(), 0);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) notify.error("登录状态恢复失败", error);
      setReady(true);
      if (data.session && !sessionRef.current) {
        sessionRef.current = data.session;
        setSession(data.session);
        void loadListRef.current();
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
    try {
      localStorage.setItem(KEY, JSON.stringify(guestsRef.current));
    } catch {
      setStatus(STATUS.localFailed);
    }
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
    if (!p) return true;
    if (!p.cloud) {
      if (!sessionRef.current) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(p)); return true; } catch (cause) { notify.error('本机保存失败，请下载备份', cause); return false; } }
      return persist(guestsRef.current);
    }
    if (!dirty.current) return true;
    const s = sessionRef.current;
    if (!s) return false;
    const generation = epoch.current,
      version = editVersion.current;
    setStatus(STATUS.saving);
    const work = (async () => {
      const { data, error } = await attempt(supabase
        .from("interior_design_projects")
        .update({
          name: p.name,
          state: p.state as unknown as Json,
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
        if (error) notify.error("云端保存失败，已保留本机恢复副本", error);
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
      setCloud((c) =>
        c.map((r) =>
          r.id === p.id
            ? {
                ...r,
                name: next.name,
                revision: next.revision,
                updatedAt: next.updatedAt,
              }
            : r,
        ),
      );
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
  const update = useCallback(
    (design: Design) => {
      const p = activeRef.current;
      if (!p) return;
      const next = { ...p, state: design, updatedAt: new Date().toISOString() };
      activeRef.current = next;
      setActive(next);
      editVersion.current++;
      if (p.cloud) {
        dirty.current = true;
        setStatus(STATUS.dirty);
        try {
          localStorage.setItem(
            "interior-recovery-" + sessionRef.current?.user.id + "-" + p.id,
            JSON.stringify(next),
          );
        } catch (cause) {
          notify.error("恢复副本保存失败，请立即导出 JSON", cause);
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 1000);
      } else if (!sessionRef.current) {
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); setStatus(STATUS.local); } catch { setStatus(STATUS.localFailed); }
      } else persist(guestsRef.current.map((r) => (r.id === p.id ? next : r)));
    },
    [persist, save],
  );
  const open = useCallback(
    async (p: ProjectSummary) => {
      if (!sessionRef.current) return false;
      if (!(await save())) return false;
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
        let found: Project = {
          id: data.id,
          name: data.name,
          state: validateDesign(data.state),
          revision: data.revision,
          updatedAt: data.updated_at || "",
          cloud: true,
        };
        const raw = localStorage.getItem(
          "interior-recovery-" + sessionRef.current?.user.id + "-" + p.id,
        );
        if (raw) {
          const draft = JSON.parse(raw) as Project;
          if (draft.updatedAt > found.updatedAt) {
            const restore = await confirm({
              title: "发现较新的本机恢复副本",
              description:
                "此项目的本机副本比云端更新，恢复它以保留未保存的编辑？",
              confirmText: "恢复副本",
            });
            if (restore) {
              found = { ...found, state: validateDesign(draft.state) };
              dirty.current = true;
            }
          }
        }
        activeRef.current = found;
        setActive(found);
        setStatus(dirty.current ? STATUS.recovery : STATUS.cloud);
        return true;
      } catch (cause) {
        notify.error("项目数据不完整，请导入备份", cause);
        return false;
      }
    },
    [confirm, save],
  );
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
      };
      if (toCloud) {
        if (!sessionRef.current) {
          notify.fail("请先登录");
          return false;
        }
        const { error } = await attempt(supabase
          .from("interior_design_projects")
          .insert({
            id: next.id,
            name: next.name,
            state: next.state as unknown as Json,
            schema_version: 2,
          }));
        if (generation !== epoch.current) return false;
        if (error) {
          notify.error("创建云端项目失败", error);
          return false;
        }
        setCloud((c) => [
          {
            id: next.id,
            name: next.name,
            revision: 0,
            updatedAt: next.updatedAt,
            cloud: true,
          },
          ...c,
        ]);
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
    if (!sessionRef.current || !p || p.cloud) return false;
    const next: Project = {
      ...p,
      id: uid(),
      name: "修改的第一个版本",
      revision: 0,
      updatedAt: new Date().toISOString(),
      cloud: true,
    };
    const { error } = await attempt(supabase
      .from("interior_design_projects")
      .insert({
        id: next.id,
        name: next.name,
        state: next.state as unknown as Json,
        schema_version: 2,
      }));
    if (error) {
      notify.error("保存到云端失败", error);
      return false;
    }
    setCloud((c) => [
      {
        id: next.id,
        name: next.name,
        revision: 0,
        updatedAt: next.updatedAt,
        cloud: true,
      },
      ...c,
    ]);
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
      if (!sessionRef.current) return false;
      if (!(await save())) return false;
      const generation = epoch.current;
      if (p.cloud) {
        const { error } = await attempt(supabase
          .from("interior_design_projects")
          .delete()
          .eq("id", p.id));
        if (generation !== epoch.current) return false;
        if (error) {
          notify.error("删除项目「" + p.name + "」失败", error);
          return false;
        }
        setCloud((c) => c.filter((r) => r.id !== p.id));
      } else persist(guestsRef.current.filter((r) => r.id !== p.id));
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
      if(!sessionRef.current)return false;
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
        setCloud((c) =>
          c.map((r) =>
            r.id === p.id ? { ...r, name, revision: data.revision } : r,
          ),
        );
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
    cloud,
    active,
    session,
    ready,
    status,
    loading,
    listReady,
    listError,
    hasMore,
    update,
    save,
    open,
    create,
    remove,
    rename,
    duplicate,
    saveGuestToCloud,
    loadMore: () => loadList(true),
    reload: () => loadList(),
    signOut,
    signingOut,
  };
}
