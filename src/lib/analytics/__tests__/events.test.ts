import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ calls: [] as unknown[][], failing: false }));
vi.mock('@enter-pro/analytics-sdk', () => ({
  trackEvent: (...args: unknown[]) => {
    if (sdk.failing) throw new Error('not initialized');
    sdk.calls.push(args);
  },
}));

import {
  trackAiGenerationCompleted,
  trackAiGenerationFailed,
  trackAiLayoutApplied,
  trackDesignFileExported,
  trackGuestSavedToCloud,
  trackLoginCompleted,
  trackProjectCreated,
  trackProjectDeleted,
  trackReportPdfExported,
  trackScene3dFailed,
  trackScene3dReady,
  trackSignupCompleted,
} from '../events';

describe('埋点事件', () => {
  beforeEach(() => { sdk.calls = []; sdk.failing = false; });

  it('事件名与已登记的一致，都按 conversion 上报，属性只有枚举和布尔值', () => {
    trackSignupCompleted({ needsVerification: true, fromCloudSave: false });
    trackLoginCompleted({ fromCloudSave: true });
    trackProjectCreated({ method: 'ai', template: 'blank' });
    trackDesignFileExported({ format: 'dxf', view: '2d' });
    trackReportPdfExported();
    trackGuestSavedToCloud();
    expect(sdk.calls).toEqual([
      ['signup_completed', { eventType: 'conversion', properties: { needs_verification: true, from_cloud_save: false } }],
      ['login_completed', { eventType: 'conversion', properties: { from_cloud_save: true } }],
      ['project_created', { eventType: 'conversion', properties: { method: 'ai', template: 'blank' } }],
      ['design_file_exported', { eventType: 'conversion', properties: { format: 'dxf', view: '2d' } }],
      ['report_pdf_exported', { eventType: 'conversion', properties: {} }],
      ['guest_saved_to_cloud', { eventType: 'conversion', properties: {} }],
    ]);
  });

  it('AI 生成的成功、失败与采纳共用同一份上下文，采纳按 conversion 上报并带候选序号', () => {
    const run = { scope: 'room_layout' as const, engine: 'google/gemini-3.8-flash', count: 2, hasReference: true };
    trackAiGenerationCompleted(run);
    trackAiGenerationFailed({ ...run, scope: 'furniture_model', engine: 'assistant', hasReference: false });
    trackAiLayoutApplied(run, 1);
    expect(sdk.calls).toEqual([
      ['ai_generation_completed', { eventType: 'custom', properties: { scope: 'room_layout', engine: 'google/gemini-3.8-flash', count: 2, has_reference: true } }],
      ['ai_generation_failed', { eventType: 'custom', properties: { scope: 'furniture_model', engine: 'assistant', count: 2, has_reference: false } }],
      ['ai_layout_applied', { eventType: 'conversion', properties: { scope: 'room_layout', engine: 'google/gemini-3.8-flash', candidate_index: 1 } }],
    ]);
  });

  it('3D 场景上报首帧耗时与失败原因，原因统一用下划线，并区分是否自动恢复', () => {
    trackScene3dReady(1234.6);
    trackScene3dFailed({ reason: 'context_lost', recovered: true });
    trackScene3dFailed({ reason: 'renderer', recovered: false });
    expect(sdk.calls).toEqual([
      ['scene_3d_ready', { eventType: 'custom', properties: { duration_ms: 1235 } }],
      ['scene_3d_failed', { eventType: 'custom', properties: { reason: 'context_lost', recovered: true } }],
      ['scene_3d_failed', { eventType: 'custom', properties: { reason: 'renderer', recovered: false } }],
    ]);
  });

  it('删除项目区分云端与本机', () => {
    trackProjectDeleted(true);
    trackProjectDeleted(false);
    expect(sdk.calls).toEqual([
      ['project_deleted', { eventType: 'custom', properties: { cloud: true } }],
      ['project_deleted', { eventType: 'custom', properties: { cloud: false } }],
    ]);
  });

  it('SDK 抛错时不影响业务流程', () => {
    sdk.failing = true;
    expect(() => trackReportPdfExported()).not.toThrow();
    expect(() => trackGuestSavedToCloud()).not.toThrow();
    expect(() => trackAiGenerationCompleted({ scope: 'plan', engine: 'assistant', count: 1, hasReference: false })).not.toThrow();
    expect(() => trackAiLayoutApplied({ scope: 'plan', engine: 'assistant', count: 1, hasReference: false }, 0)).not.toThrow();
    expect(() => trackScene3dReady(10)).not.toThrow();
    expect(() => trackScene3dFailed({ reason: 'crash', recovered: false })).not.toThrow();
    expect(() => trackProjectDeleted(true)).not.toThrow();
  });
});
