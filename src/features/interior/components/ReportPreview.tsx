import { useContext, useMemo } from "react";
import type { AccountCostSettings } from "../model/costDefaults";
import { buildReport } from "../model/report";
import type { Design } from "../model/types";
import { CostDefaultsContext } from "./CostDefaultsContext";
import { ReportDialog } from "./ReportDialog";

/**
 * 方案报告预览：读取账号默认价生成报告模型，立即显示；点「下载 PDF」时把同一组默认价交给导出，
 * 预览与 PDF 内容一致。按需懒加载，打开时才下载这部分代码。
 */
export function ReportPreview({ design, name, exporting, onClose, onExport }: {
  design: Design;
  name: string;
  exporting: boolean;
  onClose: () => void;
  onExport: (defaults: AccountCostSettings) => void;
}) {
  const defaults = useContext(CostDefaultsContext);
  const model = useMemo(() => buildReport(design, defaults, { name }), [design, defaults, name]);
  return (
    <ReportDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      model={model}
      exporting={exporting}
      onExport={() => onExport(defaults)}
    />
  );
}
