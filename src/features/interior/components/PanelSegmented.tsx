/**
 * 侧栏里的单选分段控件：与顶栏「2D 平面 / 3D 场景」同一套外观（浅底槽 + 选中项白底投影），
 * 用于朝向快捷角度、拖动步进这类 2–4 个互斥选项。选中项用 aria-pressed 表达。
 */
export function PanelSegmented<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="panel-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          onClick={() => { if (option.value !== value) onChange(option.value); }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
