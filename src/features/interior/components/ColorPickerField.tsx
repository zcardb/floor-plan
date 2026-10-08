import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FURNITURE_COLORS } from '../data/palette';

export function ColorPickerField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (color: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="custom-color-field">
    <span>{label}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <EditorTooltip label={label} disabled={disabled}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="furniture-color-trigger" disabled={disabled} aria-label={label}>
            <span className="furniture-color-swatch" style={{ background: value }} aria-hidden="true" />{value.toUpperCase()}
          </Button>
        </PopoverTrigger>
      </EditorTooltip>
      <PopoverContent align="start" className="furniture-color-panel">
        <div className="furniture-color-grid" role="group" aria-label="常用颜色">{FURNITURE_COLORS.map(c => <button key={c} type="button" className={c === value ? 'selected' : ''} style={{ background: c }} aria-label={'设置颜色 ' + c} onClick={() => { onChange(c); setOpen(false); }} />)}</div>
        <label className="furniture-color-custom">自定义颜色<input type="color" aria-label="自定义颜色" value={value} onChange={e => onChange(e.target.value)} /></label>
      </PopoverContent>
    </Popover>
  </div>;
}
