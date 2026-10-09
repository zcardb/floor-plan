import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/** 直接驱动类组件的生命周期，不依赖 DOM 环境。 */
function crash(props: ConstructorParameters<typeof ErrorBoundary>[0]) {
  const boundary = new ErrorBoundary(props);
  const error = new Error("boom");
  boundary.state = ErrorBoundary.getDerivedStateFromError(error);
  vi.spyOn(console, "error").mockImplementation(() => {});
  boundary.componentDidCatch(error, { componentStack: "" });
  return { boundary, error, output: boundary.render() };
}

describe("ErrorBoundary", () => {
  it("传了 fallback / onError 时调用 onError 并渲染 fallback", () => {
    const onError = vi.fn();
    const { error, output } = crash({ children: null, fallback: null, onError });
    expect(onError).toHaveBeenCalledWith(error);
    expect(output).toBeNull();
  });

  it("不传 props 时仍显示原来的整页提示", () => {
    const { output } = crash({ children: null });
    expect(isValidElement(output)).toBe(true);
    expect((output as ReactElement<{ role: string }>).props.role).toBe("alert");
  });

  it("没有出错时原样渲染子节点", () => {
    const boundary = new ErrorBoundary({ children: "ok", fallback: null });
    expect(boundary.render()).toBe("ok");
  });
});
