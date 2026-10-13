import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFile } from "../save-file";

const WECHAT = { userAgent: "Mozilla/5.0 (iPhone) MicroMessenger/8.0.40" };
const SAFARI = { userAgent: "Mozilla/5.0 (iPhone) Version/17.0 Safari/604.1" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("saveFile", () => {
  it("微信里返回 blocked，且不创建 <a>", () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });
    const blob = new Blob(["x"]);
    expect(saveFile(blob, "a.png", WECHAT)).toEqual({ kind: "blocked", blob, name: "a.png" });
    expect(createElement).not.toHaveBeenCalled();
  });

  it("普通浏览器下载一次并清理 URL", () => {
    vi.useFakeTimers();
    const link = { click: vi.fn(), download: "", href: "" };
    const revoke = vi.fn();
    vi.stubGlobal("document", { createElement: () => link });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: revoke });
    expect(saveFile(new Blob(["x"]), "方案.svg", SAFARI)).toEqual({ kind: "downloaded" });
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.download).toBe("方案.svg");
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
