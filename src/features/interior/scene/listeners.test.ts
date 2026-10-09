import { describe, expect, it, vi } from "vitest";
import { createListenerRegistry } from "./listeners";

function stubConsole() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("createListenerRegistry", () => {
  it("回调抛错时只调用一次 onFatal，后续事件不再触发", () => {
    stubConsole();
    const target = new EventTarget(),
      onFatal = vi.fn(),
      registry = createListenerRegistry(onFatal),
      handler = vi.fn(() => {
        throw new Error("boom");
      });
    registry.on(target, "ping", handler);
    target.dispatchEvent(new Event("ping"));
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith("crash");
    expect(handler).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event("ping"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it("disposeAll 之后再派发事件不会触发回调", () => {
    const target = new EventTarget(),
      onFatal = vi.fn(),
      registry = createListenerRegistry(onFatal),
      handler = vi.fn();
    registry.on(target, "ping", handler);
    target.dispatchEvent(new Event("ping"));
    expect(handler).toHaveBeenCalledOnce();
    registry.disposeAll();
    target.dispatchEvent(new Event("ping"));
    expect(handler).toHaveBeenCalledOnce();
    expect(onFatal).not.toHaveBeenCalled();
  });
});
