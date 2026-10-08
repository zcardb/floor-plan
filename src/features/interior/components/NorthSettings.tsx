import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notify } from '@/lib/notify';
import { changeNorthAngle, northAngle } from '../model/northAngle';
import type { Design } from '../model/types';
import { CompassRose } from './CompassRose';

const PRESETS = [
  { label: '上北', deg: 0 },
  { label: '右北', deg: 90 },
  { label: '下北', deg: 180 },
  { label: '左北', deg: 270 },
] as const;

export function NorthSettings({ design, change }: { design: Design; change: (fn: (d: Design) => Design) => void }) {
  const angle = northAngle(design);
  const apply = (value: number) => {
    if (value === angle) return;
    changeNorthAngle(design, value);
    change(d => changeNorthAngle(d, value));
  };
  return <section>
    <h3 className="section-title"><Compass size={15} />朝向</h3>
    <div className="north-settings">
      <CompassRose angle={angle} className="north-settings-preview" />
      <div className="north-settings-fields">
        <label className="property-field">北方角度 / °
          <Input className="editor-control" aria-label="北方角度 / °" key={angle} type="number" defaultValue={angle}
            min={0} max={359} step={1}
            onBlur={e => {
              if (e.currentTarget.value === String(angle)) return;
              try {
                apply(e.currentTarget.value.trim() === '' ? NaN : Number(e.currentTarget.value));
              } catch (error) {
                e.currentTarget.value = String(angle);
                notify.fail(error instanceof Error ? error.message : '北方角度无效');
              }
            }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <div className="north-presets">
          {PRESETS.map(p => <Button key={p.deg} type="button" size="sm" variant={angle === p.deg ? 'default' : 'outline'}
            className="editor-action" aria-pressed={angle === p.deg} onClick={() => apply(p.deg)}>{p.label}</Button>)}
        </div>
      </div>
    </div>
    <p className="muted-note">角度为北方相对图纸正上方的顺时针偏转，2D 平面图右上角的指北针会随之转动。</p>
  </section>;
}
