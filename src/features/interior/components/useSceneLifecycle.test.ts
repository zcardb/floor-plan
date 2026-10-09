import { describe, expect, it } from "vitest";
import { initialSceneState, sceneReducer, type SceneEvent, type SceneState } from "./useSceneLifecycle";

const run = (events: SceneEvent[], from: SceneState = initialSceneState) => events.reduce(sceneReducer, from);
const opened = run([{ type: "open" }, { type: "ready" }]);

describe("sceneReducer", () => {
  it("打开 3D 先显示加载中，首帧完成后撤掉", () => {
    expect(run([{ type: "open" }])).toMatchObject({ view: "3d", loading: true });
    expect(opened).toMatchObject({ view: "3d", loading: false });
  });

  it("第一次 context-lost：换代重挂并保持 3D", () => {
    const next = sceneReducer(opened, { type: "fail", reason: "context-lost" });
    expect(next).toEqual({ view: "3d", loading: true, generation: 1, recoveries: 1 });
  });

  it("第二次 context-lost 切回 2D", () => {
    const next = run([{ type: "fail", reason: "context-lost" }, { type: "ready" }, { type: "fail", reason: "context-lost" }], opened);
    expect(next).toMatchObject({ view: "2d", loading: false, generation: 1 });
  });

  it("crash / renderer / module 直接切回 2D，不换代", () => {
    for (const reason of ["crash", "renderer", "module"] as const)
      expect(sceneReducer(opened, { type: "fail", reason })).toMatchObject({ view: "2d", loading: false, generation: 0 });
  });

  it("重新 open 后恢复次数归零，可以再自动恢复一次", () => {
    const back = run([{ type: "fail", reason: "context-lost" }, { type: "fail", reason: "context-lost" }, { type: "open" }], opened);
    expect(back).toMatchObject({ view: "3d", recoveries: 0 });
    expect(sceneReducer(back, { type: "fail", reason: "context-lost" })).toMatchObject({ view: "3d", recoveries: 1, generation: 2 });
  });

  it("已在 2D 时迟到的失败事件被忽略", () => {
    expect(sceneReducer(initialSceneState, { type: "fail", reason: "crash" })).toBe(initialSceneState);
  });
});
