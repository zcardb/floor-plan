import { trackEvent } from '@enter-pro/analytics-sdk';

/**
 * 关键转化事件：注册、登录、新建项目、导出文件、导出方案报告。
 * 事件名已在 Enter Analytics 后台登记；新增事件要先登记再在这里加，未登记的事件会被后台丢弃。
 * properties 只放枚举 / 布尔值，绝不放邮箱、输入内容等个人信息。
 */
export type ProjectCreateMethod = 'manual' | 'ai' | 'import';
export type ExportedFormat = 'png' | 'pdf' | 'svg' | 'dxf' | 'json';

type Properties = Record<string, string | number | boolean>;

/** 统计失败不能影响业务流程（例如 SDK 还没初始化或被拦截）。 */
function conversion(name: string, properties: Properties = {}) {
  try {
    trackEvent(name, { eventType: 'conversion', properties });
  } catch {
    // 统计是旁路，忽略
  }
}

export const trackSignupCompleted = (p: { needsVerification: boolean; fromCloudSave: boolean }) =>
  conversion('signup_completed', { needs_verification: p.needsVerification, from_cloud_save: p.fromCloudSave });

export const trackLoginCompleted = (p: { fromCloudSave: boolean }) =>
  conversion('login_completed', { from_cloud_save: p.fromCloudSave });

export const trackProjectCreated = (p: { method: ProjectCreateMethod; template: string }) =>
  conversion('project_created', { method: p.method, template: p.template });

export const trackDesignFileExported = (p: { format: ExportedFormat; view: '2d' | '3d' }) =>
  conversion('design_file_exported', { format: p.format, view: p.view });

export const trackReportPdfExported = () => conversion('report_pdf_exported');
