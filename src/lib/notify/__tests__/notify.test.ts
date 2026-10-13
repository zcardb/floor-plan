import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: calls }));

import { errorMessage, notify } from "..";

describe("errorMessage", () => {
  it("读取 Error / 字符串 / 带 message 的对象", () => {
    expect(errorMessage(new Error("网络断开"))).toBe("网络断开");
    expect(errorMessage("版本冲突")).toBe("版本冲突");
    expect(errorMessage({ message: "row level security" })).toBe("row level security");
  });
  it("未知值使用兜底文案", () => {
    expect(errorMessage(null, "保存失败")).toBe("保存失败");
    expect(errorMessage(new Error(""), "保存失败")).toBe("保存失败");
    expect(errorMessage(42)).toBe("未知错误");
  });
});

describe("notify", () => {
  it("报错带 Error Info 描述，失败仅标题", () => {
    notify.error("保存到云端失败", new Error("timeout"));
    expect(calls.error).toHaveBeenLastCalledWith("保存到云端失败", expect.objectContaining({ description: "timeout" }));
    notify.fail("价格无效");
    expect(calls.error).toHaveBeenLastCalledWith("价格无效", expect.objectContaining({ duration: 4000 }));
    expect(calls.error.mock.lastCall?.[1]).not.toHaveProperty("description");
  });
  it("成功与信息", () => {
    notify.success("已应用");
    expect(calls.success).toHaveBeenLastCalledWith("已应用", expect.objectContaining({ duration: 2500 }));
    notify.info("提示");
    expect(calls.info).toHaveBeenCalledWith("提示", expect.any(Object));
  });
});
