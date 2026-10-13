import { FileDown, Loader2 } from "lucide-react";
import { Suspense, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCostSettings } from "../model/costDefaults";
import type { Design } from "../model/types";
import { CostDefaultsContext } from "./CostDefaultsContext";
import { ReportContent } from "./lazyDialogs";
import { ReportLoading } from "./ReportLoading";

/**
 * 方案报告预览弹窗：点「生成方案报告」立即打开，正文先显示 Loading，
 * 报告代码下载完、内容算完后再替换成正文。点「下载 PDF」时把同一组账号默认价交给导出，预览与 PDF 内容一致。
 * 窄屏下全屏显示，正文滚动，底部按钮常驻。
 */
export function ReportDialog({ open, design, name, exporting = false, onClose, onExport }: {
  open: boolean;
  design: Design;
  name: string;
  exporting?: boolean;
  onClose: () => void;
  onExport: (defaults: AccountCostSettings) => void;
}) {
  const defaults = useContext(CostDefaultsContext);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !exporting) onClose(); }}>
      <DialogContent className="report-dialog">
        <DialogHeader className="report-dialog-head">
          <DialogTitle>方案报告预览</DialogTitle>
          <DialogDescription>下载的 PDF 与预览内容一致：首页平面图与关键信息，第 2 页目录与预算，之后是各项清单。</DialogDescription>
        </DialogHeader>
        <div className="report-dialog-body">
          <Suspense fallback={<ReportLoading />}>
            <ReportContent design={design} name={name} />
          </Suspense>
        </div>
        <DialogFooter className="report-dialog-foot">
          <Button type="button" variant="outline" disabled={exporting} onClick={onClose}>关闭</Button>
          <Button type="button" disabled={exporting} onClick={() => onExport(defaults)}>
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
            {exporting ? "正在生成…" : "下载 PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
