import { describe, expect, it } from "vitest";
import { canDownloadDirectly, isCoarsePointer, isWeChat, supportsPointerLock } from "../capabilities";

const WECHAT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("capabilities", () => {
  it("微信内置浏览器不能直接下载", () => {
    expect(isWeChat({ userAgent: WECHAT_UA })).toBe(true);
    expect(canDownloadDirectly({ userAgent: WECHAT_UA })).toBe(false);
    expect(canDownloadDirectly({ userAgent: SAFARI_UA })).toBe(true);
  });

  it("没有 exitPointerLock 时不支持指针锁定", () => {
    expect(supportsPointerLock({ document: {} })).toBe(false);
    expect(supportsPointerLock({ document: null })).toBe(false);
    expect(supportsPointerLock({ document: { exitPointerLock: () => {} } })).toBe(true);
  });

  it("按媒体查询判断触屏，缺少 matchMedia 时视为非触屏", () => {
    expect(isCoarsePointer({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(isCoarsePointer({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isCoarsePointer({})).toBe(false);
  });
});
