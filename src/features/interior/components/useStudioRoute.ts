import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import type { useProjects } from "../cloud/useProjects";
import { PROJECTS_PATH, projectPathFor, resolveView } from "../model/routes";

type Projects = ReturnType<typeof useProjects>;

/** 被拦下的跳转：确认后放行，或取消并留在原页。 */
export interface PendingLeave {
  proceed: () => void;
  reset: () => void;
}

/**
 * 页面级路由与工作室状态的双向同步。URL 是「当前在哪个页面」的唯一来源：
 * - 界面操作成功后调用 goToActive / goTo 改地址；
 * - 地址变化（刷新、粘贴链接、前进后退）时按地址里的项目 id 打开项目；
 * - 离开前的守卫（未保存的账号单价、未落盘的项目改动）统一在这里处理。
 */
export function useStudioRoute(projects: Projects, cmsDirty: boolean) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const owner = projects.session?.user.id;
  const ready = projects.ready;
  const view = resolveView({ pathname, loggedIn: !!owner });

  const redirect = ready && view.kind === "redirect" ? view.to : null;
  useEffect(() => {
    if (redirect) void navigate(redirect, { replace: true });
  }, [redirect, navigate]);

  // 地址 → 项目：地址里的项目变化时对齐一次；界面内切换项目由调用方随后改地址。
  const targetId = ready && view.kind === "project" ? view.projectId : null;
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const { openById, current } = projects;
  useEffect(() => {
    if (!targetId) {
      // 离开项目页后作废旧的对齐结果，回来时必须重新确认，不会先闪出别的项目。
      setSyncedId(null);
      return;
    }
    if (current()?.id === targetId) {
      setSyncedId(targetId);
      return;
    }
    let live = true;
    void openById(targetId).then((ok) => {
      if (!live) return;
      if (ok) setSyncedId(targetId);
      // 打不开（不存在 / 无权限，open 已提示原因）：换掉这条地址，回到项目管理。
      else void navigate(PROJECTS_PATH, { replace: true });
    });
    return () => {
      live = false;
    };
  }, [targetId, owner, openById, current, navigate]);

  const goTo = useCallback((path: string) => void navigate(path), [navigate]);
  /** 打开 / 新建 / 复制成功后，把地址切到当前项目。 */
  const goToActive = useCallback(() => {
    const project = current();
    const path = project && projectPathFor(project);
    if (path) void navigate(path);
  }, [current, navigate]);

  // 全应用只有这一个 blocker：浏览器后退和界面内跳转走同一条路径。
  const guardCms = view.kind === "cms" && cmsDirty;
  const guardProject = view.kind === "project" && projects.status.kind !== "saved";
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (guardCms || guardProject) && currentLocation.pathname !== nextLocation.pathname,
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const blocked = blocker.state === "blocked";
  const save = projects.save;
  // 离开项目详情前先落盘：成功才放行，失败留在原页（保存失败的提示由 save 给出）。
  const savingLeave = blocked && view.kind === "project";
  useEffect(() => {
    if (!savingLeave) return;
    let live = true;
    void save().then((ok) => {
      const pending = blockerRef.current;
      if (!live || pending.state !== "blocked") return;
      if (ok) pending.proceed();
      else pending.reset();
    });
    return () => {
      live = false;
    };
  }, [savingLeave, save]);

  const pendingLeave: PendingLeave | null =
    blocked && view.kind === "cms"
      ? {
          proceed: () => { if (blockerRef.current.state === "blocked") blockerRef.current.proceed(); },
          reset: () => { if (blockerRef.current.state === "blocked") blockerRef.current.reset(); },
        }
      : null;

  const projectReady =
    view.kind === "project" && (projects.active?.id === view.projectId || syncedId === view.projectId);

  return { view, projectReady, pendingLeave, goTo, goToActive };
}
