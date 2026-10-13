import { useEffect, useRef } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

type Props = { label: string; placeholder: string; value: string; onChange: (value: string) => void; loading?: boolean; loadingLabel?: string; matchCount?: number };

const typingTarget = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * 管理端统一搜索框：空闲时提示 `/` 快捷键，输入后显示匹配数与清空按钮，Esc 清空。
 * 焦点在其它输入控件或有弹窗打开时，`/` 不抢焦点。
 */
export function CmsSearchField({ label, placeholder, value, onChange, loading = false, loadingLabel = '加载中', matchCount }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);
  const searching = value !== '';
  return <div className="cms-search cost-search cms-search-field" aria-busy={loading}>
    {loading ? <Loader2 className="animate-spin" size={17} aria-label={loadingLabel} /> : <Search size={17} />}
    <input ref={input} aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && searching) { event.preventDefault(); onChange(''); } }} />
    {searching
      ? <>
        {matchCount !== undefined && <span className="cms-search-count" role="status">匹配 {matchCount} 项</span>}
        <EditorTooltip label="清空搜索" shortcut="Esc"><button type="button" aria-label="清空搜索" onClick={() => { onChange(''); input.current?.focus(); }}><X size={16} /></button></EditorTooltip>
      </>
      : <kbd className="cms-search-kbd" aria-hidden="true">/</kbd>}
  </div>;
}
