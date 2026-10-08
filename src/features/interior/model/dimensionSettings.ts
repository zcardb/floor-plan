import type { Design } from './types';

export const defaultDimensionSettings = { visible: true, top: 650, bottom: 750, left: 800, right: 900 };
export type DimensionSettingKey = keyof typeof defaultDimensionSettings;
export function dimensionSettings(d: Pick<Design, 'dimensionSettings'>) {
  return { ...defaultDimensionSettings, ...d.dimensionSettings };
}
export function changeDimensionSetting(d: Design, key: DimensionSettingKey, value: number | boolean): Design {
  if (key === 'visible' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000)
    throw new Error('标注距离须在 0–10 m 之间');
  return { ...d, dimensionSettings: { ...d.dimensionSettings, [key]: value } };
}
