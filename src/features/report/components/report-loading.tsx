import { Loader2 } from "lucide-react";

/** 报告弹窗正文的加载态：居中转圈 + 一句说明。 */
export function ReportLoading() {
  return (
    <div className="report-loading" role="status" aria-live="polite">
      <Loader2 className="animate-spin" aria-hidden="true" />
      <span>正在生成方案报告…</span>
    </div>
  );
}
