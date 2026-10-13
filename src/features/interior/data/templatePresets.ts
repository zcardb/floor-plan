import type { Design, Project } from '../model/types';

export interface TemplatePreset {
  id: string;
  name: string;
  layout: string;
  description: string;
  /** Indoor outline area, not developer-advertised gross floor area. */
  area: number;
  build: () => Design;
}

export const PRESET_IDS = ['reference'];
export const isPresetId = (id: unknown): id is string => typeof id === 'string' && PRESET_IDS.includes(id);
export const BUILTIN_PREFIX = 'builtin-template:';
export const isBuiltinId = (id: string) => id.startsWith(BUILTIN_PREFIX);
export function builtinProject(preset: TemplatePreset): Project {
  return { id: BUILTIN_PREFIX + preset.id, name: preset.name, state: preset.build(), revision: 0, updatedAt: '', builtin: true, templateId: preset.id };
}
