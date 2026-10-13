/** 方案报告预览弹窗：外壳随工作台常驻（很轻），打开后才下载报告正文。 */
export { ReportDialog } from './components/report-dialog';
/** 生成报告 PDF（含 pdf-lib）：点击导出时才下载。 */
export const loadReportExport = () => import('./model/report-export');
