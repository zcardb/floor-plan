import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { FURNITURE_COLORS } from '../data/palette';

/**
 * 全项目唯一的颜色选择：默认只显示一个当前色块，点开是同一个弹层（常用色 + 自定义取色）。
 * - 选常用色立即生效并关闭弹层，只记一步撤销。
 * - 自定义色在取色器确认（原生 change）时提交一次，拖动预览不写撤销记录。
 * `variant` 只决定触发器长相：`swatch` 是工具条里的纯色块，`field` 是表单 / 属性面板里的「色块 + HEX」。
 */
export function ColorPicker({ label, value, onChange, variant = 'field', disabled = false, triggerId }: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  variant?: 'swatch' | 'field';
  disabled?: boolean;
  /** `field` 触发器需要的 input / label 关联 id。 */
  triggerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = variant === 'swatch'
    ? <button type="button" className="color-picker-swatch" style={{ background: value || undefined }} disabled={disabled} aria-label={`${label}：${value || '未设置'}，点击选择颜色`} />
    : <button type="button" id={triggerId} className="color-picker-field" disabled={disabled} aria-label={label}>
      <span className="color-picker-chip" style={{ background: value || undefined }} aria-hidden="true" />
      <span>{value ? value.toUpperCase() : '未设置'}</span>
      <ChevronDown size={12} aria-hidden="true" />
    </button>;
  return <Popover open={open && !disabled} onOpenChange={setOpen}>
    {variant === 'swatch'
      ? <EditorTooltip label={label} disabled={disabled}><PopoverTrigger asChild>{trigger}</PopoverTrigger></EditorTooltip>
      : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
    <PopoverContent align="start" className="color-picker-panel">
      <h3>{label}</h3>
      <div className="color-picker-grid" role="group" aria-label="常用颜色">
        {FURNITURE_COLORS.map(color => <button key={color} type="button" className={color === value ? 'selected' : ''}
          style={{ background: color }} aria-label={'设置颜色 ' + color} aria-pressed={color === value}
          onClick={() => { onChange(color); setOpen(false); }} />)}
      </div>
      <CustomColor key={value} label={label} value={value} onCommit={onChange} />
    </PopoverContent>
  </Popover>;
}

/** 系统取色器：React 的 onChange 是 input 事件（拖动就触发），这里只在原生 change（确认）时提交。 */
function CustomColor({ label, value, onCommit }: { label: string; value: string; onCommit: (color: string) => void }) {
  const input = useRef<HTMLInputElement>(null), commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const done = () => commit.current(node.value);
    node.addEventListener('change', done);
    return () => node.removeEventListener('change', done);
  }, []);
  return <label className="color-picker-custom">
    <span>自定义颜色</span>
    <input ref={input} type="color" defaultValue={value || '#eee9de'} aria-label={`自定义${label}`} />
  </label>;
}
