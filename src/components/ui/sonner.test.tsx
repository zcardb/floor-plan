import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Toaster } from './sonner';
describe('全站实色提示', () => {
  it('即使调用者传true也不显示关闭按钮，保留所有语义图标和实色底', () => {
    const node = Toaster({ closeButton: true });
    expect(node.props.closeButton).toBe(false);
    expect(node.props.position).toBe('top-center');
    for (const key of ['success', 'error', 'warning', 'info', 'loading']) expect(node.props.icons[key]).toBeDefined();
    const names = node.props.toastOptions.classNames;
    for (const key of ['toast', 'success', 'error', 'warning']) expect(names[key]).toContain('bg-toast-surface');
    expect(names.description).toBeTruthy();
  });
  it('提示底色为不透明卡片色，压在画布上也清晰可读', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('--toast-surface-alpha: 1');
    expect(css).not.toContain('--toast-surface-alpha: 0');
    const app = readFileSync('src/App.tsx', 'utf8'); expect(app).not.toContain('@/components/ui/toaster');
    expect(app).toContain('@/components/ui/sonner');
  });
});
