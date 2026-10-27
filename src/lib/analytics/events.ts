import { trackEvent } from '@enter-pro/analytics-sdk';

/**
 * 埋点事件：关键转化（注册、登录、新建项目、导出、AI 采纳、游客转存）
 * 与使用情况（AI 生成结果、3D 场景打开情况、项目删除）。
 * 事件名已在 Enter Analytics 后台登记；新增事件要先登记再在这里加，未登记的事件会被后台丢弃。
 * properties 只放枚举 / 计数 / 布尔值，绝不放邮箱、输入内容、项目名等个人信息。
 */
export type ProjectCreateMethod = 'manual' | 'ai' | 'import';
export type ExportedFormat = 'png' | 'pdf' | 'svg' | 'dxf' | 'json';
/** 一次 AI 生成所属的场景。 */
export type AiScope = 'room_layout' | 'plan' | 'furniture_image' | 'furniture_model';
/** 3D 场景失败原因，与 features/scene-3d 的 SceneFailure 一一对应（连字符记成下划线）。 */
export type Scene3dFailureReason = 'module' | 'renderer' | 'crash' | 'context_lost';

type Properties = Record<string, string | number | boolean>;
type EventType = 'conversion' | 'custom';

/** 统计失败不能影响业务流程（例如 SDK 还没初始化或被拦截）。 */
function report(name: string, eventType: EventType, properties: Properties = {}) {
  try {
    trackEvent(name, { eventType, properties });
  } catch {
    // 统计是旁路，忽略
  }
}

const conversion = (name: string, properties: Properties = {}) => report(name, 'conversion', properties);
const custom = (name: string, properties: Properties = {}) => report(name, 'custom', properties);

export const trackSignupCompleted = (p: { needsVerification: boolean; fromCloudSave: boolean }) =>
  conversion('signup_completed', { needs_verification: p.needsVerification, from_cloud_save: p.fromCloudSave });

export const trackLoginCompleted = (p: { fromCloudSave: boolean }) =>
  conversion('login_completed', { from_cloud_save: p.fromCloudSave });

export const trackProjectCreated = (p: { method: ProjectCreateMethod; template: string }) =>
  conversion('project_created', { method: p.method, template: p.template });

export const trackDesignFileExported = (p: { format: ExportedFormat; view: '2d' | '3d' }) =>
  conversion('design_file_exported', { format: p.format, view: p.view });

export const trackReportPdfExported = () => conversion('report_pdf_exported');

/**
 * 一次 AI 生成的上下文：场景、所选引擎（模型 id，用自定义小助手时记为 assistant）、
 * 候选数量、是否带参考图或素材。成功、失败、采纳三个事件共用，便于同一口径对比。
 */
export interface AiRun {
  scope: AiScope;
  engine: string;
  count: number;
  hasReference: boolean;
}

const aiRunProperties = (run: AiRun): Properties => ({
  scope: run.scope,
  engine: run.engine,
  count: run.count,
  has_reference: run.hasReference,
});

/** 一批 AI 生成结束，至少一个候选可用。 */
export const trackAiGenerationCompleted = (run: AiRun) => custom('ai_generation_completed', aiRunProperties(run));

/** 一批 AI 生成结束，全部候选失败。 */
export const trackAiGenerationFailed = (run: AiRun) => custom('ai_generation_failed', aiRunProperties(run));

/** 用户把 AI 结果应用到方案上（房间布局、AI 创建户型、家具图片 / 3D 模型）。 */
export const trackAiLayoutApplied = (run: AiRun, candidateIndex: number) =>
  conversion('ai_layout_applied', { scope: run.scope, engine: run.engine, candidate_index: candidateIndex });

/** 3D 场景首帧渲染完成；durationMs 为从点开 3D 到首帧的耗时。 */
export const trackScene3dReady = (durationMs: number) =>
  custom('scene_3d_ready', { duration_ms: Math.round(durationMs) });

/** 3D 场景打开失败或场景出错；recovered 表示失败后自动恢复并留在了 3D。 */
export const trackScene3dFailed = (p: { reason: Scene3dFailureReason; recovered: boolean }) =>
  custom('scene_3d_failed', { reason: p.reason, recovered: p.recovered });

/** 游客登录后「保存到云端」写入成功。 */
export const trackGuestSavedToCloud = () => conversion('guest_saved_to_cloud');

/** 项目删除成功；cloud 区分云端项目与本机方案。 */
export const trackProjectDeleted = (cloud: boolean) => custom('project_deleted', { cloud });
