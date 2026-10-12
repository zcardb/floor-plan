import { lazy } from 'react';

/** 方案报告预览：首次打开时才下载。 */
export const ReportPreview = lazy(() => import('./components/report-preview').then(m => ({ default: m.ReportPreview })));
/** 生成报告 PDF（含 pdf-lib）：点击导出时才下载。 */
export const loadReportExport = () => import('./model/report-export');
