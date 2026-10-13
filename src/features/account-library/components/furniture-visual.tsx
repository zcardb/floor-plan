import { AiIcon } from '@/components/ai-icon/ai-icon';
import { Button } from '@/components/ui/button';
import type { LibraryItem } from '@/lib/floor-plan/types';
import { FurnitureShape } from '@/components/furniture-shape/furniture-shape';

/**
 * 家具详情左侧视觉区：只有 2D——有俯视图显示图片，没有时显示参考符号；软装与硬装一致。
 * 右上角「AI 调整」更换 2D 俯视图，没有保存权限时不显示。
 * 3D 外观统一由装修风格决定（3D 场景按风格程序化生成家具），这里不逐件预览 3D。
 */
export function FurnitureVisual({ item, onAdjust }: { item: LibraryItem; onAdjust?: () => void }) {
  return <div className="furniture-visual">
    {onAdjust && <Button type="button" size="sm" variant="secondary" className="furniture-visual-ai" onClick={onAdjust}>
      <AiIcon size={14} />AI 调整
    </Button>}
    <div className="furniture-visual-stage">
      {item.imageUrl
        ? <img src={item.imageUrl} crossOrigin="anonymous" alt={`${item.name}2D 俯视图`} />
        : <svg viewBox={`${-item.w / 2 - 100} ${-item.d / 2 - 100} ${item.w + 200} ${item.d + 200}`} role="img" aria-label={`${item.name}参考符号`}><FurnitureShape f={item} /></svg>}
    </div>
  </div>;
}
