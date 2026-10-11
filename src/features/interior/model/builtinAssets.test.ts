import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { library } from '../data/catalog';
import { assetsAdjusted, libraryWithOverrides, overrideRow, syncBuiltinFurniture, withBuiltinAssets } from './builtinAssets';
import type { Design, Furniture } from './types';

const builtin = library.find(item => !item.imageUrl && item.type !== 'stairs')!;
const placed = (extra: Partial<Furniture> = {}): Furniture => ({ ...builtin, id: 'f1', cx: 1000, cy: 1000, rot: 0, ...extra } as Furniture);
const design = (furniture: Furniture[]): Design => ({ ...blankDesign(), furniture });
const top = 'https://cdn.example.com/top.webp';

describe('内置家具素材覆盖', () => {
  it('只覆盖 2D / 3D 素材，名称与尺寸沿用内置值', () => {
    const row = { ...overrideRow(builtin, { imageUrl: top }), name: '改名', w: 9999 };
    const merged = withBuiltinAssets(builtin, row);
    expect(merged).toMatchObject({ name: builtin.name, w: builtin.w, imageUrl: top });
    expect(assetsAdjusted(builtin, row)).toBe(true);
    expect(assetsAdjusted(builtin, overrideRow(builtin, {}))).toBe(false);
    expect(assetsAdjusted(builtin, undefined)).toBe(false);
  });
  it('素材库套用覆盖，其他内置家具不变', () => {
    const list = libraryWithOverrides([overrideRow(builtin, { imageUrl: top })]);
    expect(list).toHaveLength(library.length);
    expect(list.find(item => item.catalogId === builtin.catalogId)!.imageUrl).toBe(top);
    expect(list.filter(item => item.imageUrl === top)).toHaveLength(1);
  });
  it('已放置的同款家具跟随覆盖，恢复默认后一并恢复；没有覆盖行时不动', () => {
    const d = design([placed(), placed({ id: 'f2', catalogId: 'custom-1' })]);
    expect(syncBuiltinFurniture(d, [])).toBeNull();
    const adjusted = syncBuiltinFurniture(d, [overrideRow(builtin, { imageUrl: top })])!;
    expect(adjusted.furniture[0]!.imageUrl).toBe(top);
    expect(adjusted.furniture[1]).toBe(d.furniture[1]);
    expect(syncBuiltinFurniture(adjusted, [overrideRow(builtin, { imageUrl: top })])).toBeNull();
    const restored = syncBuiltinFurniture(adjusted, [overrideRow(builtin, { imageUrl: undefined })])!;
    expect('imageUrl' in restored.furniture[0]!).toBe(false);
  });
  it('只改素材字段，项目里调过的尺寸、颜色保留', () => {
    const d = design([placed({ w: 1234, color: '#123456' })]);
    const next = syncBuiltinFurniture(d, [overrideRow(builtin, { imageUrl: top })])!;
    expect(next.furniture[0]).toMatchObject({ w: 1234, color: '#123456', imageUrl: top });
  });
});
