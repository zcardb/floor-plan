import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ calls: [] as unknown[][], failing: false }));
vi.mock('@enter-pro/analytics-sdk', () => ({
  trackEvent: (...args: unknown[]) => {
    if (sdk.failing) throw new Error('not initialized');
    sdk.calls.push(args);
  },
}));

import {
  trackDesignFileExported,
  trackLoginCompleted,
  trackProjectCreated,
  trackReportPdfExported,
  trackSignupCompleted,
} from '../conversion-events';

describe('关键转化事件', () => {
  beforeEach(() => { sdk.calls = []; sdk.failing = false; });

  it('事件名与已登记的一致，都按 conversion 上报，属性只有枚举和布尔值', () => {
    trackSignupCompleted({ needsVerification: true, fromCloudSave: false });
    trackLoginCompleted({ fromCloudSave: true });
    trackProjectCreated({ method: 'ai', template: 'blank' });
    trackDesignFileExported({ format: 'dxf', view: '2d' });
    trackReportPdfExported();
    expect(sdk.calls).toEqual([
      ['signup_completed', { eventType: 'conversion', properties: { needs_verification: true, from_cloud_save: false } }],
      ['login_completed', { eventType: 'conversion', properties: { from_cloud_save: true } }],
      ['project_created', { eventType: 'conversion', properties: { method: 'ai', template: 'blank' } }],
      ['design_file_exported', { eventType: 'conversion', properties: { format: 'dxf', view: '2d' } }],
      ['report_pdf_exported', { eventType: 'conversion', properties: {} }],
    ]);
  });

  it('SDK 抛错时不影响业务流程', () => {
    sdk.failing = true;
    expect(() => trackReportPdfExported()).not.toThrow();
  });
});
