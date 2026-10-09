import { useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';
import { FURNITURE_COLORS } from '../data/palette';

/** 常用色板 + 自定义取色。自定义色在取色器确认（原生 change）时提交一次，拖动预览不写撤销记录。 */
export function ColorSwatches({ value, onPick, className = 'visual-colors' }: { value: string; onPick: (color: string) => void; className?: string }) {
  const custom = useRef<HTMLInputElement>(null), pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    const input = custom.current;
    if (!input) return;
    const commit = () => pick.current(input.value);
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);
  return <div className={className} role="group" aria-label="常用颜色">
    {FURNITURE_COLORS.map(c => (
      <button type="button" key={c} className={value === c ? 'selected' : ''} style={{ background: c }} aria-label={'设置颜色 ' + c} onClick={() => onPick(c)} />
    ))}
    <label className="visual-custom-color">
      <Palette size={15} />
      <input ref={custom} key={value} aria-label="自定义颜色" type="color" defaultValue={value || '#eee9de'} />
    </label>
  </div>;
}
