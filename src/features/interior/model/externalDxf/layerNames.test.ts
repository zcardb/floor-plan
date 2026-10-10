import { describe, expect, it } from 'vitest';
import { layerLabel } from './layerNames';
import { DRAWING_LAYERS, DRAWING_LAYER_NAMES } from '../drawingDocument';

describe('图层中文名', () => {
  it('本应用导出的图层全部有中文名', () => {
    expect(DRAWING_LAYERS.map(layerLabel)).toEqual(DRAWING_LAYERS.map(layer => DRAWING_LAYER_NAMES[layer]));
  });
  it('常见 CAD 图层名与中文图层名', () => {
    expect(['0', 'A-WALL', 'DOOR', 'WINDOW', 'COLUMN', 'AXIS', 'TEXT', '墙', 'QT'].map(layerLabel))
      .toEqual(['默认图层', '墙体', '门', '窗', '柱子', '轴线', '文字', '墙体', '墙体']);
  });
  it('认不出的图层返回空，界面显示原名', () => {
    expect(layerLabel('XREF-1')).toBe('');
  });
});
