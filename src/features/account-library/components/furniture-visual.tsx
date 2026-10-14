import { Suspense, useState, type MutableRefObject } from 'react';
import { Box, Loader2, Square } from 'lucide-react';
import { AiIcon } from '@/components/ai-icon/ai-icon';
import { Button } from '@/components/ui/button';
import { FurnitureShape } from '@/components/furniture-shape/furniture-shape';
import type { LibraryItem } from '@/lib/floor-plan/types';
import { FURNITURE_VIEW_LABEL as VIEW_LABEL, type FurnitureView } from '@/features/ai-design';
import { FurnitureModelPreview, type ModelSnapshot } from '@/features/scene-3d';
import { hasViews } from '../model/furniture-views';

/**
 * 家具详情左侧视觉区：软装家具左上角是 2D / 3D 切换，右上角是「AI 调整」（没有保存权限时不显示）。
 * 2D 有俯视图显示图片，没有时显示参考符号；3D 实时渲染与项目 3D 场景相同的模型（可拖动旋转），
 * WebGL 不可用时退回旧的 3D 效果图或提示。硬装只有 2D。
 */
export function FurnitureVisual({ item, view = 'top', onView, onAdjust, snapshotRef }: {
  item: LibraryItem;
  view?: FurnitureView;
  onView?: (view: FurnitureView) => void;
  onAdjust?: () => void;
  /** 3D 实时模型的截图函数：没有可参考的图片时，作为 3D「AI 调整」的默认素材。 */
  snapshotRef?: MutableRefObject<ModelSnapshot | null>;
}) {
  const views = hasViews(item) && !!onView, active: FurnitureView = views ? view : 'top';
  const [modelFailed, setModelFailed] = useState(false);
  const live3d = active === 'perspective' && !modelFailed;
  return <div className="furniture-visual">
    {views && <div className="furniture-visual-views" role="radiogroup" aria-label="预览视角">
      {(['top', 'perspective'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={active === v}
        aria-label={VIEW_LABEL[v]} className={active === v ? 'is-active' : undefined} onClick={() => onView(v)}>
        {v === 'top' ? <Square size={13} /> : <Box size={13} />}{v === 'top' ? '2D' : '3D'}
      </button>)}
    </div>}
    {onAdjust && <Button type="button" size="sm" variant="secondary" className="furniture-visual-ai" onClick={onAdjust}>
      <AiIcon size={14} />AI 调整
    </Button>}
    {live3d
      ? <div className="furniture-visual-3d" role="img" aria-label={`${item.name}实时 3D 模型预览`}>
        <Suspense fallback={<div className="furniture-visual-loading"><Loader2 className="animate-spin" />正在加载 3D 模型…</div>}>
          <FurnitureModelPreview item={item} snapshotRef={snapshotRef} onFail={() => setModelFailed(true)} />
        </Suspense>
      </div>
      : <div className="furniture-visual-stage">
        {active === 'top'
          ? item.imageUrl
            ? <img src={item.imageUrl} crossOrigin="anonymous" alt={`${item.name}${VIEW_LABEL.top}`} />
            : <svg viewBox={`${-item.w / 2 - 100} ${-item.d / 2 - 100} ${item.w + 200} ${item.d + 200}`} role="img" aria-label={`${item.name}参考符号`}><FurnitureShape f={item} /></svg>
          : item.image3dUrl
            ? <img src={item.image3dUrl} crossOrigin="anonymous" alt={`${item.name}${VIEW_LABEL.perspective}`} />
            : <div className="furniture-visual-empty">
              <Box size={28} />
              <p>当前设备无法显示 3D 模型</p>
            </div>}
      </div>}
  </div>;
}
