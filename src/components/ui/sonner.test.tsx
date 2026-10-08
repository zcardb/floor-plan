import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Toaster } from './sonner';
describe('全站透明提示', () => {
  it('即使调用者传true也不显示关闭按钮，保留所有语义图标和透明样式', () => {
    const node = Toaster({ closeButton: true });
    expect(node.props.closeButton).toBe(false);
    expect(node.props.position).toBe('top-center');
    for (const key of ['success', 'error', 'warning', 'info', 'loading']) expect(node.props.icons[key]).toBeDefined();
    const names = node.props.toastOptions.classNames;
    for (const key of ['toast', 'success', 'error', 'warning']) expect(names[key]).toContain('bg-toast-surface');
    expect(names.description).toBeTruthy();
  });
  it('透明背景token为零alpha，旧提示无关闭节点、不再实心', () => {
    const css = readFileSync('src/index.css', 'utf8'); expect(css).toContain('--toast-surface-alpha: 0');
    const legacy = readFileSync('src/components/ui/toaster.tsx', 'utf8'); expect(legacy).not.toContain('ToastClose');
    const variants = readFileSync('src/components/ui/toast.tsx', 'utf8'); expect(variants).toContain('bg-toast-surface'); expect(variants).not.toContain('bg-background text-foreground');
  });
});
