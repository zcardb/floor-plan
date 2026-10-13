import { describe, expect, it } from 'vitest';
import { library } from '@/lib/floor-plan/catalog';
import { furnitureGeometryPayload } from '../model/furniture-geometry-save';

describe('外形保存不回写账号价格覆盖', () => {
  for (const price of [null, 0, 150, undefined]) {
    it(`保留家具库基础价 ${price}`, () => {
      const stored = { ...library[0], price };
      const edited = { ...stored, w: 1900, price: 800, imageUrl: 'https://example.com/new.webp' };
      const payload = furnitureGeometryPayload(edited, stored);
      expect(payload.price).toBe(price);
      expect(payload.w).toBe(1900);
      expect(payload.imageUrl).toBe(edited.imageUrl);
      expect(payload.catalogId).toBe(stored.catalogId);
      expect(stored.imageUrl).not.toBe(edited.imageUrl);
      expect(stored.w).toBe(library[0].w);
      expect(edited.price).toBe(800);
    });
  }
});
