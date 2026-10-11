import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { MAX_MODEL_PARTS, sanitizeModel3d, validModel3d } from './furniture3d';
import { validateDesign } from './validation';
import type { LibraryItem } from './types';

const sofa: LibraryItem = { catalogId: 'c-1', name: '微波炉', category: '厨房', type: 'generic', shape: 'reference', w: 500, d: 400, height: 300, color: '#dddddd' };

const part = (over: Record<string, unknown> = {}) => ({ kind: 'box', x: 0, y: 0, z: 0, w: 0.5, h: 1, d: 0.5, color: '#aabbcc', ...over });

describe('AI 简易 3D 模型', () => {
  it('整理非法部件：丢掉缺字段 / 颜色错的，尺寸与位置收进外框', () => {
    const clean = sanitizeModel3d({ parts: [
      part({ x: 9, y: 9, z: -9, w: 2, h: 3, d: 2 }),
      { kind: 'box', x: 0, y: 0, z: 0, w: 0.4, h: 0.4, d: 0.4, color: 'red' },
      { kind: 'cone', x: 0, y: 0, z: 0, w: 0.4, h: 0.4, d: 0.4, color: '#112233' },
      part({ kind: 'cylinder', axis: 'x', finish: 'metal', round: true, color: '#AABBCC' }),
    ] });
    expect(clean?.parts).toHaveLength(2);
    const [first, second] = clean!.parts;
    expect(first).toMatchObject({ w: 1, h: 1, d: 1, x: 0, y: 0, z: 0 });
    // 颜色统一小写；圆柱保留轴向与质感；方块的圆角标记不在圆柱上出现。
    expect(second).toMatchObject({ kind: 'cylinder', axis: 'x', finish: 'metal', color: '#aabbcc' });
    expect(second.round).toBeUndefined();
  });
  it('部件数量封顶，空模型与非法输入返回 null', () => {
    const many = { parts: Array.from({ length: MAX_MODEL_PARTS + 20 }, () => part()) };
    expect(sanitizeModel3d(many)?.parts).toHaveLength(MAX_MODEL_PARTS);
    expect(sanitizeModel3d({ parts: [] })).toBeNull();
    expect(sanitizeModel3d(null)).toBeNull();
    expect(sanitizeModel3d({ parts: [{ kind: 'box' }] })).toBeNull();
  });
  it('整理结果自身合法，多一位小数即判为不合法', () => {
    const clean = sanitizeModel3d({ parts: [part()] });
    expect(validModel3d(clean)).toBe(true);
    expect(validModel3d({ ...clean, parts: [{ ...clean!.parts[0], x: 0.0001 }] })).toBe(false);
  });
  it('数据库重排字段顺序后仍判为合法，数值不同仍拒绝', () => {
    // 数据库返回的 JSON 字段顺序与写入时不同（短键在前）。
    const stored = { parts: [{ d: 0.09, h: 0.92, w: 0.075, x: -0.39, y: 0.045, z: 0, kind: 'box', color: '#666665' }], version: 1 };
    expect(validModel3d(stored)).toBe(true);
    expect(validModel3d({ ...stored, parts: [{ ...stored.parts[0], x: -0.3901 }] })).toBe(false);
    const design = { ...blankDesign(), customCatalog: [{ ...sofa, model3d: stored }] };
    expect(validateDesign(JSON.parse(JSON.stringify(design))).customCatalog?.[0]?.model3d?.parts).toHaveLength(1);
  });
  it('方案校验接受合法模型、拒绝越界部件；缺省仍兼容', () => {
    const item = { ...sofa, model3d: sanitizeModel3d({ parts: [part(), part({ kind: 'sphere', y: 0.5 })] })! };
    const base = { ...blankDesign(), customCatalog: [item] };
    expect(validateDesign(JSON.parse(JSON.stringify(base))).customCatalog?.[0]?.model3d?.parts).toHaveLength(2);
    const broken = { ...base, customCatalog: [{ ...item, model3d: { version: 1, parts: [{ ...item.model3d.parts[0], h: 5 }] } }] };
    expect(() => validateDesign(JSON.parse(JSON.stringify(broken)))).toThrow();
    const legacy = { ...blankDesign(), customCatalog: [sofa] };
    expect(validateDesign(JSON.parse(JSON.stringify(legacy))).customCatalog?.[0]?.model3d).toBeUndefined();
  });
});
