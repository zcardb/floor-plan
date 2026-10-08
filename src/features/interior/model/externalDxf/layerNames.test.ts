import { describe, expect, it } from 'vitest';
import { layerLabel } from './layerNames';

describe('图层中文名', () => {
  it('本应用导出的图层全部有中文名', () => {
    const names = ['WALLS', 'DEMOLISHED', 'ROOMS', 'OPENINGS', 'FURNITURE', 'ROOM_LABELS', 'DIMENSIONS'].map(layerLabel);
    expect(names).toEqual(['墙体', '拆除墙体', '房间', '门窗', '家具', '房间名称', '尺寸标注']);
  });
  it('常见 CAD 图层名与中文图层名', () => {
    expect(['0', 'A-WALL', 'DOOR', 'WINDOW', 'COLUMN', 'AXIS', 'TEXT', '墙', 'QT'].map(layerLabel))
      .toEqual(['默认图层', '墙体', '门', '窗', '柱子', '轴线', '文字', '墙体', '墙体']);
  });
  it('认不出的图层返回空，界面显示原名', () => {
    expect(layerLabel('XREF-1')).toBe('');
  });
});
