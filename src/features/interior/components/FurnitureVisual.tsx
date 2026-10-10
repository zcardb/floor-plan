import { useState, type MutableRefObject } from 'react';
import { Box, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HARD_CATEGORIES } from '../model/hardMaterials';
import type { LibraryItem } from '../model/types';
import type { FurnitureView } from '../cloud/useFurnitureImage';
import { FurnitureShape } from './FurnitureShape';
import { FurnitureModelPreview, type ModelSnapshot } from './FurnitureModelPreview';

export const VIEW_LABEL: Record<FurnitureView, string> = { top: '2D 俯视图', perspective: '3D 模型' };

/** 当前视角的图片地址；没有时 undefined。 */
export const viewImage = (item: LibraryItem, view: FurnitureView) => (view === 'top' ? item.imageUrl : item.image3dUrl);

/** 只有软装家具需要 3D 视角与 AI 调整；硬装（地面、墙面、门窗、屋面、吊顶）只有 2D。 */
export const hasViews = (item: LibraryItem) => !HARD_CATEGORIES.includes(item.category);

/**
 * 家具详情左侧视觉区：软装家具左上角给 2D / 3D 切换、右上角给「AI 调整」；
 * 硬装只有 2D 一张图，不显示视角切换。2D 无图时显示参考符号；3D 始终实时渲染与项目 3D 场景
 * 相同的模型，WebGL 不可用时才退回效果图或生成入口。
 */
export function FurnitureVisual({ item, view, onView, onAdjust, snapshotRef }: {
  item: LibraryItem;
  view: FurnitureView;
  onView: (view: FurnitureView) => void;
  onAdjust?: () => void;
  /** 3D 实时模型的截图函数（无 3D 图时作为 AI 调整的默认素材）。 */
  snapshotRef?: MutableRefObject<ModelSnapshot | null>;
}) {
  const views = hasViews(item), image = viewImage(item, views ? view : 'top'), [modelFailed, setModelFailed] = useState(false);
  const live3d = views && view === 'perspective' && !modelFailed;
  return <div className="furniture-visual">
    {views && <div className="furniture-visual-views" role="radiogroup" aria-label="预览视角">
      {(['top', 'perspective'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={view === v}
        aria-label={VIEW_LABEL[v]} className={view === v ? 'is-active' : undefined} onClick={() => onView(v)}>
        {v === 'top' ? <Square size={13} /> : <Box size={13} />}{v === 'top' ? '2D' : '3D'}
      </button>)}
    </div>}
    {onAdjust && <Button type="button" size="sm" variant="secondary" className="furniture-visual-ai" onClick={onAdjust}>
      <Sparkles size={14} />AI 调整
    </Button>}
    {live3d && <FurnitureModelPreview item={item} snapshotRef={snapshotRef} onFail={() => setModelFailed(true)} />}
    {!live3d && <div className="furniture-visual-stage">
      {image
        ? <img src={image} crossOrigin="anonymous" alt={`${item.name}${VIEW_LABEL[views ? view : 'top']}`} />
        : !views || view === 'top'
          ? <svg viewBox={`${-item.w / 2 - 100} ${-item.d / 2 - 100} ${item.w + 200} ${item.d + 200}`} role="img" aria-label={`${item.name}参考符号`}><FurnitureShape f={item} /></svg>
          : <div className="furniture-visual-empty">
            <Box size={28} />
            <p>当前设备无法显示 3D 模型</p>
            {onAdjust && <Button type="button" size="sm" onClick={onAdjust}><Sparkles size={14} />AI 生成</Button>}
          </div>}
    </div>}
  </div>;
}
