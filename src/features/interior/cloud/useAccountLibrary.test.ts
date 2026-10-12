import { describe, expect, it } from 'vitest';
import { splitAccountLibrary } from './useAccountLibrary';
import { BUILTIN_IDS } from '../model/builtinAssets';

const furniture = (catalogId: string, name: string) => ({
  kind: 'furniture',
  data: { catalog_id: catalogId, name, category: '客厅', type: 'chair', shape: null, width: 500, depth: 500, height: 800, color: '#cccccc', price: null, image_url: null, image_3d_url: null, model_3d: null },
});

describe('账号库合并视图：一行一个条目，按 kind 分组', () => {
  it('六类条目一次拿到并分到各自列表；内置家具的覆盖行单独归入 overrides', () => {
    const rows = [
      furniture('mine-1', '升降桌'),
      furniture(BUILTIN_IDS[0], '内置覆盖'),
      { kind: 'floor', data: { floor_key: 'custom-11111111-1111-4111-8111-111111111111', name: '混凝土浇筑', pattern: 'seamless', color: '#b8b8b0', price: null, length: null, width: null } },
      { kind: 'wall', data: { wall_key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 } },
      { kind: 'roof', data: { roof_key: 'custom-33333333-3333-4333-8333-333333333333', name: '青瓦', color: '#555555', price: '80' } },
      { kind: 'ceiling', data: { ceiling_key: 'custom-44444444-4444-4444-8444-444444444444', name: '石膏板', color: '#ffffff', price: null } },
      { kind: 'opening', data: { opening_key: 'custom-55555555-5555-4555-8555-555555555555', name: '玻璃门', kind: 'door', width: 900, height: 2100, price: 1500 } },
    ];
    const data = splitAccountLibrary(rows);
    expect(data.furniture.map(item => item.name)).toEqual(['升降桌']);
    expect(data.overrides.map(item => item.catalogId)).toEqual([BUILTIN_IDS[0]]);
    expect(data.floors.map(item => item.name)).toEqual(['混凝土浇筑']);
    expect(data.walls).toEqual([{ key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 }]);
    expect(data.roofs[0].price).toBe(80);
    expect(data.ceilings[0].price).toBeNull();
    expect(data.openings[0]).toMatchObject({ name: '玻璃门', kind: 'door', width: 900, height: 2100, price: 1500 });
  });

  it('无效行丢弃，不影响其它条目', () => {
    const data = splitAccountLibrary([
      { kind: 'wall', data: { wall_key: 'not-a-custom-key', name: '', color: 'red', price: null } },
      { kind: 'floor', data: { floor_key: 'custom-11111111-1111-4111-8111-111111111111', name: '木地板', pattern: 'nope', color: '#aa8866', price: 1 } },
      furniture('mine-2', '书桌'),
    ]);
    expect(data.walls).toEqual([]);
    expect(data.floors).toEqual([]);
    expect(data.furniture.map(item => item.name)).toEqual(['书桌']);
  });
});
