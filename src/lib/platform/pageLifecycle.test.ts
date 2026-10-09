import { afterEach, describe, expect, it, vi } from "vitest";
import { onPageHide } from "./pageLifecycle";

function stubPage() {
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  return { win, doc };
}
afterEach(() => vi.unstubAllGlobals());

describe("onPageHide", () => {
  it("先执行 flush 再执行 persist，与注册顺序无关", () => {
    const { win } = stubPage(), calls: string[] = [];
    const offs = [onPageHide(() => calls.push("persist"), "persist"), onPageHide(() => calls.push("flush"), "flush")];
    win.dispatchEvent(new Event("pagehide"));
    expect(calls).toEqual(["flush", "persist"]);
    offs.forEach((off) => off());
  });

  it("页面变为 hidden 时触发，变为 visible 时不触发；取消注册后不再触发", () => {
    const { doc } = stubPage(), handler = vi.fn();
    const off = onPageHide(handler, "persist");
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handler).not.toHaveBeenCalled();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handler).toHaveBeenCalledOnce();
    off();
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
