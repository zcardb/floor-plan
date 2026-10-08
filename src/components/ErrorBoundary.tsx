import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** 根级兜底：渲染出错时给出可恢复的页面，而不是白屏。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染出错", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">页面出了点问题</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          你的设计已保存在本机或云端。刷新页面即可继续；若反复出现，请先导出 JSON 备份。
        </p>
        <p className="max-w-md break-words text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button onClick={() => window.location.reload()}>刷新页面</Button>
      </div>
    );
  }
}
