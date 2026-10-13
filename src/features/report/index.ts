/** 方案报告预览弹窗：外壳常驻（很轻），正文在打开后才懒加载并在下一帧计算。 */
export { ReportDialog } from './components/report-dialog';
/** 生成报告 PDF（含 pdf-lib）：点击导出时才下载。 */
export const loadReportExport = () => import('./model/report-export');
