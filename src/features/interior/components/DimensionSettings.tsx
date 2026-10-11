import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { notify } from "@/lib/notify";
import { dimensionSettings, changeDimensionSetting } from '../model/dimensionSettings';
import { meterDraft, parseMeterDraft } from '../model/lengthUnits';
import type { Design } from '../model/types';

export function DimensionSettings({ design, change }: { design: Design; change: (fn: (d: Design) => Design) => void }) {
  const settings = dimensionSettings(design);
  return <section>
    <h3 className="section-title">外围尺寸标注</h3>
    {/* 开关是一整行：左文字、右开关，点文字也能切换 */}
    <label className="setting-row"><span>显示尺寸标注</span>
      <Switch aria-label="显示尺寸标注" checked={settings.visible} onCheckedChange={value => change(d => changeDimensionSetting(d, 'visible', value))} />
    </label>
    <div className="property-form">
      {(['top', 'bottom', 'left', 'right'] as const).map((key, i) => <label className="property-field" key={key}>
        {['上侧距离 / m', '下侧距离 / m', '左侧距离 / m', '右侧距离 / m'][i]}
        <Input className="editor-control" aria-label={['上侧距离 / m', '下侧距离 / m', '左侧距离 / m', '右侧距离 / m'][i]} disabled={!settings.visible}
          key={settings[key]} type="number" defaultValue={meterDraft(settings[key])} min={0} max={10} step={0.01}
          onBlur={e => {
            if (e.currentTarget.value === meterDraft(settings[key])) return;
            const value = parseMeterDraft(e.currentTarget.value);
            try {
              changeDimensionSetting(design, key, value);
              change(d => changeDimensionSetting(d, key, value));
            } catch (error) {
              e.currentTarget.value = meterDraft(settings[key]);
              notify.fail(error instanceof Error ? error.message : '标注距离无效');
            }
          }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </label>)}
    </div>
    <p className="muted-note">{settings.visible ? '距离从墙体外缘计算。标注数字根据墙体自动生成，不能手动覆盖。' : '开启「显示尺寸标注」后可调整标注距离。'}</p>
  </section>;
}
