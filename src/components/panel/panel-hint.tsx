import { useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

const storageKey = (id: string) => 'interior-hint-dismissed:' + id;
const isDismissed = (id: string) => { try { return localStorage.getItem(storageKey(id)) === '1'; } catch { return false; } };

/** 面板底部操作提示：用户关闭后记住，不再重复出现。 */
export function PanelHint({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => isDismissed(id));
  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(storageKey(id), '1'); } catch { /* 隐私模式下仅本次隐藏 */ }
    setHidden(true);
  };
  return <div className="panel-note">
    <Info size={15} />
    <div className="panel-note-body">{children}</div>
    <EditorTooltip label="不再显示">
      <button type="button" className="panel-note-close" aria-label="关闭提示，不再显示" onClick={dismiss}><X size={13} /></button>
    </EditorTooltip>
  </div>;
}

/** 键盘快捷键说明。 */
export function ShortcutList() {
  const keys: [string, string][] = [['V', '选择 / 移动'], ['R', '旋转家具 90°'], ['Ctrl Z', '撤销更改'], ['Ctrl D', '复制家具 / 门窗'], ['Ctrl ] / [', '家具上移 / 下移一层（加 Shift 置顶 / 置底）'], ['T', '2D / 3D 切换'], ['F', '适应窗口']];
  return <div className="shortcut-list">{keys.map(([key, label]) => <span key={key} className="contents"><kbd>{key}</kbd><span>{label}</span></span>)}</div>;
}
