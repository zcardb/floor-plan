import { describe, expect, it, vi } from "vitest";
import { releasePointerLock } from "./pointerLock";

function makeWalk(isLocked: boolean, exitPointerLock: unknown) {
  const domElement = {
    ownerDocument: { exitPointerLock },
  } as unknown as HTMLElement;
  return { isLocked, unlock: vi.fn(), domElement };
}

describe("releasePointerLock", () => {
  it("does not throw or unlock when the browser lacks exitPointerLock (iOS)", () => {
    const walk = makeWalk(true, undefined);
    expect(() => releasePointerLock(walk)).not.toThrow();
    expect(walk.unlock).not.toHaveBeenCalled();
  });

  it("does not unlock when not locked", () => {
    const walk = makeWalk(false, () => {});
    releasePointerLock(walk);
    expect(walk.unlock).not.toHaveBeenCalled();
  });

  it("unlocks once when locked and supported (desktop)", () => {
    const walk = makeWalk(true, () => {});
    releasePointerLock(walk);
    expect(walk.unlock).toHaveBeenCalledTimes(1);
  });
});
