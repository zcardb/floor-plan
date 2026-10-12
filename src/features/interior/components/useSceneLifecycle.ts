import { useCallback, useRef, useState } from "react";
import { notify } from "@/lib/notify";
import type { SceneFailure } from "../scene/Scene3D";

export type SceneEvent =
  | { type: "open" }
  | { type: "ready" }
  | { type: "close" }
  | { type: "fail"; reason: SceneFailure };
export interface SceneState {
  view: "2d" | "3d";
  /** 3D 已打开但首帧尚未完成。 */
  loading: boolean;
  /** 场景挂载代次：变化时整个 3D 场景以新 key 重新挂载。 */
  generation: number;
  /** 本次 3D 会话已自动恢复的次数。 */
  recoveries: number;
}
export const initialSceneState: SceneState = { view: "2d", loading: false, generation: 0, recoveries: 0 };

export const SCENE_FAILURE_MESSAGE: Record<SceneFailure, string> = {
  module: "3D 引擎加载失败，请检查网络后重试，2D 仍可编辑",
  renderer: "设备无法启动 3D，请继续使用 2D 编辑",
  crash: "3D 场景出错，已切回 2D，设计未受影响",
  "context-lost": "3D 图形资源被系统回收，已切回 2D，可重新进入 3D",
};

/**
 * 3D 生命周期的唯一状态机。
 * - 本次会话第一次 context-lost：换代重挂场景，保持 3D 并显示加载中；
 * - 其他失败或再次丢失：切回 2D；
 * - open 开启新会话，恢复次数归零。
 */
export function sceneReducer(state: SceneState, event: SceneEvent): SceneState {
  switch (event.type) {
    case "open":
      return state.view === "3d" ? state : { ...state, view: "3d", loading: true, recoveries: 0 };
    case "ready":
      return state.view === "3d" && state.loading ? { ...state, loading: false } : state;
    case "close":
      return state.view === "2d" ? state : { ...state, view: "2d", loading: false };
    case "fail":
      if (state.view !== "3d") return state;
      if (event.reason === "context-lost" && state.recoveries === 0)
        return { ...state, loading: true, generation: state.generation + 1, recoveries: 1 };
      return { ...state, view: "2d", loading: false };
  }
}

export function useSceneLifecycle() {
  const [state, setState] = useState(initialSceneState);
  const latest = useRef(state);
  latest.current = state;
  const dispatch = useCallback((event: SceneEvent) => {
    const prev = latest.current,
      next = sceneReducer(prev, event);
    if (next === prev) return;
    latest.current = next;
    setState(next);
    if (event.type === "fail" && next.view === "2d") notify.fail(SCENE_FAILURE_MESSAGE[event.reason]);
  }, []);
  return {
    ...state,
    open: () => dispatch({ type: "open" }),
    ready: () => dispatch({ type: "ready" }),
    close: () => dispatch({ type: "close" }),
    fail: (reason: SceneFailure) => dispatch({ type: "fail", reason }),
  };
}
