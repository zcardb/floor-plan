import { describe, expect, it } from 'vitest';
import { TEMPLATE_PRESETS, createProject } from '../templates';
import { validateDesign } from '../validation';
import { isPristineDesign } from '@/features/projects/model/template-state';

describe('内置模板', () => {
  it('只保留「原木之家」一套', () => expect(TEMPLATE_PRESETS.map(p=>p.id)).toEqual(['reference']));
  for (const p of TEMPLATE_PRESETS) {
    it(`${p.id} 能加载、克隆和识别初始方案`, () => {
      const d=p.build();
      expect(()=>validateDesign(d)).not.toThrow();
      expect(d.furniture.length).toBeGreaterThanOrEqual(18);
      expect(isPristineDesign(createProject(p.id).state)).toBe(true);
      const copy=p.build();d.furniture[0].cx+=100;
      expect(copy.furniture[0].cx).not.toBe(d.furniture[0].cx);
    });
  }
});
