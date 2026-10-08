import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
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
  } catch {
    toast.error("本机项目读取失败，可通过 JSON 文件恢复");
  }
  return [createProject("reference")];
}
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  cloud?: boolean;
}
export function useProjects() {
  const [guests, setGuests] = useState(initialProjects),
    [session, setSession] = useState<Session | null>(null),
    [cloud, setCloud] = useState<ProjectSummary[]>([]),
    [active, setActive] = useState<Project | null>(defaultGuest),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("本机已保存"),
    [loading, setLoading] = useState(false),
    [hasMore, setHasMore] = useState(false);
  const sessionRef = useRef(session),
    activeRef = useRef(active),
    guestsRef = useRef(guests),
    epoch = useRef(0),
    dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saving = useRef<Promise<boolean> | null>(null),
    editVersion = useRef(0);
  sessionRef.current = session;
  activeRef.current = active;
  guestsRef.current = guests;
  const persist = useCallback((ps: Project[]) => {
    setGuests(ps);
    guestsRef.current = ps;
    try {
      localStorage.setItem(KEY, JSON.stringify(ps));
      setStatus("本机已保存");
      return true;
    } catch {
      setStatus("本机保存失败");
      toast.error("本机存储空间不足，请导出 JSON 保留方案");
      return false;
    }
  }, []);
  const loadList = useCallback(
    async (more = false) => {
      if (!sessionRef.current) return;
      const generation = epoch.current;
      setLoading(true);
      const start = more ? cloud.length : 0;
      const { data, error } = await supabase
        .from("interior_design_projects")
        .select("id,name,updated_at,revision")
        .order("updated_at", { ascending: false })
        .range(start, start + 19);
      if (generation !== epoch.current) return;
      setLoading(false);
      if (error) {
        toast.error("云端项目读取失败：" + error.message);
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
        setLoading(false);
        const guest = defaultGuest(); activeRef.current = guest; setActive(guest);
        setStatus('本机已保存');
      }
      sessionRef.current = s;
      setSession(s);
      setReady(true);
      if (s) setTimeout(() => void loadListRef.current(), 0);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) toast.error("登录状态恢复失败");
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
      setStatus("本机保存失败");
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
      if (!sessionRef.current) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(p)); return true; } catch { toast.error('本机保存失败，请下载备份'); return false; } }
      return persist(guestsRef.current);
    }
    if (!dirty.current) return true;
    const s = sessionRef.current;
    if (!s) return false;
    const generation = epoch.current,
      version = editVersion.current;
    setStatus("正在云端保存…");
    const work = (async () => {
      const { data, error } = await supabase
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
        .maybeSingle();
      if (generation !== epoch.current) return false;
      if (error || !data) {
        setStatus(error ? "云端保存失败" : "版本冲突，请另存");
        toast.error(
          error
            ? "保存失败，已保留本机恢复副本"
            : "项目已在其它窗口修改，请另存新项目以保留当前设计",
        );
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
      setStatus(dirty.current ? "有待保存更改" : "云端已保存");
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
        setStatus("有待保存更改");
        try {
          localStorage.setItem(
            "interior-recovery-" + sessionRef.current?.user.id + "-" + p.id,
            JSON.stringify(next),
          );
        } catch {
          toast.error("恢复副本保存失败，请立即导出 JSON");
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 1000);
      } else if (!sessionRef.current) {
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); setStatus('本机已保存'); } catch { setStatus('本机保存失败'); }
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
          setStatus("本机已保存");
          return true;
        }
        return false;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("interior_design_projects")
        .select("*")
        .eq("id", p.id)
        .maybeSingle();
      if (generation !== epoch.current) return false;
      setLoading(false);
      if (error || !data) {
        toast.error("项目加载失败，请重试");
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
          if (
            draft.updatedAt > found.updatedAt &&
            window.confirm(
              "发现此项目较新的本机恢复副本。恢复它以保留未保存编辑？",
            )
          ) {
            found = { ...found, state: validateDesign(draft.state) };
            dirty.current = true;
          }
        }
        activeRef.current = found;
        setActive(found);
        setStatus(dirty.current ? "恢复副本待保存" : "云端已保存");
        return true;
      } catch {
        toast.error("项目数据不完整，请导入备份");
        return false;
      }
    },
    [save],
  );
  const create = useCallback(
    async (p: Project, toCloud = false) => {
      if (!sessionRef.current) return false;
      const saved = await save();
      if (
        !saved &&
        !(
          dirty.current &&
          window.confirm(
            "当前云端项目保存失败。将当前设计另存为新项目以保留更改？",
          )
        )
      )
        return false;
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
          toast.error("请先登录");
          return false;
        }
        const { error } = await supabase
          .from("interior_design_projects")
          .insert({
            id: next.id,
            name: next.name,
            state: next.state as unknown as Json,
            schema_version: 2,
          });
        if (generation !== epoch.current) return false;
        if (error) {
          toast.error("创建云端项目失败：" + error.message);
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
        setStatus("云端已保存");
      } else persist([next, ...guestsRef.current]);
      epoch.current++;
      dirty.current = false;
      activeRef.current = next;
      setActive(next);
      return true;
    },
    [persist, save],
  );
  const remove = useCallback(
    async (p: ProjectSummary) => {
      if (!sessionRef.current) return;
      if (!(await save())) return;
      const generation = epoch.current;
      if (p.cloud) {
        const { error } = await supabase
          .from("interior_design_projects")
          .delete()
          .eq("id", p.id);
        if (generation !== epoch.current) return;
        if (error) {
          toast.error("删除失败：" + error.message);
          return;
        }
        setCloud((c) => c.filter((r) => r.id !== p.id));
      } else persist(guestsRef.current.filter((r) => r.id !== p.id));
      if (activeRef.current?.id === p.id) {
        epoch.current++;
        dirty.current = false;
        const next = guestsRef.current[0] || null;
        activeRef.current = next;
        setActive(next);
        setStatus("本机已保存");
      }
      toast.success("项目已删除");
    },
    [persist, save],
  );
  const rename = useCallback(
    async (p: ProjectSummary, name: string) => {
      name = name.trim();
      if (!name || name.length > 100) return;
      if (!(await save())) return;
      if (p.cloud) {
        const { data, error } = await supabase
          .from("interior_design_projects")
          .update({
            name,
            revision: p.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id)
          .eq("revision", p.revision)
          .select("revision")
          .maybeSingle();
        if (error || !data) {
          toast.error("重命名失败或版本已变化，请重新加载");
          return;
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
    },
    [persist, save],
  );
  const duplicate = useCallback(
    async (p: ProjectSummary) => {
      if (!(await open(p))) return;
      const current = activeRef.current;
      if (current)
        await create({ ...current, name: current.name + " · 副本" }, !!p.cloud);
    },
    [open, create],
  );
  const signOut = async () => {
    if (!(await save())) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("退出失败，请重试");
  };
  return {
    guests,
    cloud,
    active,
    session,
    ready,
    status,
    loading,
    hasMore,
    update,
    save,
    open,
    create,
    remove,
    rename,
    duplicate,
    loadMore: () => loadList(true),
    reload: () => loadList(),
    signOut,
  };
}
