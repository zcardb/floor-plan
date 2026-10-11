import { notify } from '@/lib/notify';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

/**
 * 工具条里的对象名称：平时看起来就是粗体文字，点一下即可改名。
 * 回车或失焦提交，Esc 放弃；空名称恢复原名（与右侧属性面板「名称」同一规则）。
 */
export function EditorNameInput({ value, label, onRename }: { value: string; label: string; onRename: (name: string) => void }) {
  return <EditorTooltip label="点击修改名称">
    <input className="visual-object-name is-editable" key={value} defaultValue={value} maxLength={100} aria-label={label}
      size={Math.max(2, Math.min(value.length, 10))}
      onFocus={e => e.currentTarget.select()}
      onBlur={e => {
        const next = e.currentTarget.value.trim();
        if (next === value) return;
        if (!next) {
          e.currentTarget.value = value;
          notify.fail('名称不能为空，已恢复原名称');
          return;
        }
        onRename(next);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur(); }
      }} />
  </EditorTooltip>;
}
