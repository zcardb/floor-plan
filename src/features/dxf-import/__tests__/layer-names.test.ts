import { describe, expect, it } from 'vitest';
import { layerLabel } from '../model/external-dxf/layer-names';
import { DRAWING_LAYERS, DRAWING_LAYER_NAMES } from '@/lib/drawing/drawing-document';
import { CAD_LAYER_NAMES } from '@/lib/drawing/drawing-style';

describe('图层中文名', () => {
  it('本应用导出的标准图层（AIA / NCS）全部有中文名', () => {
    expect(DRAWING_LAYERS.map(layer => layerLabel(CAD_LAYER_NAMES[layer]))).toEqual(DRAWING_LAYERS.map(layer => DRAWING_LAYER_NAMES[layer]));
    expect(layerLabel(CAD_LAYER_NAMES.WALL_HATCH)).toBe('填充');
  });
  it('旧版导出的英文图层名仍有中文名', () => {
    expect(['WALLS', 'DEMOLISHED', 'OPENINGS', 'FURNITURE', 'STAIRS', 'ROOM_LABELS', 'DIMENSIONS'].map(layerLabel))
      .toEqual(['墙体', '拆除墙体', '门窗', '家具', '楼梯', '房间名称', '尺寸标注']);
  });
  it('常见 CAD 图层名与中文图层名', () => {
    expect(['0', 'A-WALL', 'DOOR', 'WINDOW', 'COLUMN', 'AXIS', 'TEXT', '墙', 'QT'].map(layerLabel))
      .toEqual(['默认图层', '墙体', '门', '窗', '柱子', '轴线', '文字', '墙体', '墙体']);
  });
  it('认不出的图层返回空，界面显示原名', () => {
    expect(layerLabel('XREF-1')).toBe('');
  });
});
