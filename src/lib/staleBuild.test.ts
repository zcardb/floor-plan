import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
import { isStaleBuildError } from './staleBuild';
import { notify } from './notify';

beforeEach(() => { toast.warning.mockReset(); toast.error.mockReset(); });

describe('网站更新后的按需模块加载失败', () => {
  it('识别 Chrome / Firefox / Safari 的报错文案，普通错误不算', () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/drawingExport-BDUgkyJE.js'))).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new Error('中文字体加载失败，请检查网络后重试'))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it('导出等操作遇到它时，提示刷新页面（带按钮），不再显示英文原始报错', () => {
    notify.error('导出失败', new TypeError('Failed to fetch dynamically imported module: https://x/assets/drawingExport-BDUgkyJE.js'));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledOnce();
    const [title, options] = toast.warning.mock.calls[0];
    expect(title).toBe('网站已更新，需要刷新页面');
    expect(options).toMatchObject({ id: 'stale-build', action: { label: '刷新页面' } });
  });

  it('其它错误照常显示', () => {
    notify.error('导出失败', new Error('磁盘已满'));
    expect(toast.error).toHaveBeenCalledWith('导出失败', expect.objectContaining({ description: '磁盘已满' }));
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
