import type { AccountCostSettings } from "@/lib/floor-plan/cost-defaults";
import { fileName, loadPdfFont, type ExportFile } from "@/lib/drawing/drawing-export";
import { buildReport } from "./report";
import type { Design } from "@/lib/floor-plan/types";

/**
 * 方案报告 PDF 文件：buildReport → loadPdfFont → reportPdf（平面图与关键信息页 + 目录预算页 + 清单页）。
 * 只生成文件，与 drawingFile 同一约定：保存方式（直接下载 / 微信长按保存）与提示由调用方统一处理。
 *
 * `defaults` 是账号默认价，类型即 calculateCosts 的第二个参数；传入后金额与成本侧栏一致。
 * 文件名为「项目名-方案报告.pdf」，非法字符按 drawingExport 的 fileName 规则替换；项目名为空时写「未命名方案」。
 */
export async function reportFile(design: Design, name: string, defaults?: AccountCostSettings): Promise<ExportFile> {
  const report = buildReport(design, defaults, { name });
  const [{ reportPdf }, fontBytes] = await Promise.all([import("./report-pdf"), loadPdfFont()]);
  const bytes = await reportPdf(report, { fontBytes });
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    name: fileName(`${report.info.name}-方案报告`, "pdf"),
  };
}
