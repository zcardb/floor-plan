import { describe, expect, it, vi } from "vitest";
import { releasePointerLock, tryPointerLock } from "../pointer-lock";

function makeWalk(isLocked: boolean, exitPointerLock: unknown) {
  const domElement = {
    ownerDocument: { exitPointerLock },
  } as unknown as HTMLElement;
  return { isLocked, unlock: vi.fn(), domElement };
}

describe("releasePointerLock", () => {
  it("浏览器没有 exitPointerLock（iOS）时不抛异常、不解锁", () => {
    const walk = makeWalk(true, undefined);
    expect(() => releasePointerLock(walk)).not.toThrow();
    expect(walk.unlock).not.toHaveBeenCalled();
  });

  it("未锁定时不解锁", () => {
    const walk = makeWalk(false, () => {});
    releasePointerLock(walk);
    expect(walk.unlock).not.toHaveBeenCalled();
  });

  it("桌面端已锁定时解锁一次", () => {
    const walk = makeWalk(true, () => {});
    releasePointerLock(walk);
    expect(walk.unlock).toHaveBeenCalledTimes(1);
  });
});

describe("tryPointerLock", () => {
  it("请求被拒绝时返回 false", async () => {
    const el = { requestPointerLock: vi.fn(() => Promise.reject(new Error("denied"))) } as unknown as Element;
    await expect(tryPointerLock(el)).resolves.toBe(false);
  });

  it("同步抛错或 API 缺失（iOS）时返回 false", async () => {
    const throwing = { requestPointerLock: () => { throw new Error("sandboxed"); } } as unknown as Element;
    await expect(tryPointerLock(throwing)).resolves.toBe(false);
    await expect(tryPointerLock({} as Element)).resolves.toBe(false);
    await expect(tryPointerLock(null)).resolves.toBe(false);
  });

  it("成功时返回 true（兼容不返回 Promise 的旧实现）", async () => {
    await expect(tryPointerLock({ requestPointerLock: () => Promise.resolve() } as unknown as Element)).resolves.toBe(true);
    await expect(tryPointerLock({ requestPointerLock: () => undefined } as unknown as Element)).resolves.toBe(true);
  });
});
