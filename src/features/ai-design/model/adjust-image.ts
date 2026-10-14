import { formatMeters } from '@/lib/floor-plan/length-units';
import type { LibraryItem } from '@/lib/floor-plan/types';
import type { FurnitureView } from '../hooks/use-furniture-image';

/**
 * 「AI 调整」默认带上的参考图：2D 用 2D 俯视图本身；3D 建模优先用已有的 3D 效果图，
 * 没有时退回 2D 俯视图（外形轮廓比参考几何的方块更有参考价值）。2D 不拿 3D 效果图顶替。
 * 放在轻量模块里：家具详情弹窗要用它判断是否需要截取实时 3D 画面，又不能提前下载 AI 弹窗。
 */
export const defaultAdjustImage = (item: LibraryItem, view: FurnitureView = 'top') =>
  view === 'top' ? item.imageUrl : item.image3dUrl ?? item.imageUrl;

/** 视角名称：AI 调整的标题、成功提示与家具详情的视角切换共用。 */
export const VIEW_LABEL: Record<FurnitureView, string> = { top: '2D 俯视图', perspective: '3D 模型' };

/** 默认需求：名称、尺寸与主色，用户可直接改。 */
export const defaultFurniturePrompt = (item: LibraryItem) =>
  `${item.name}，${formatMeters(item.w)} × ${formatMeters(item.d)}${item.height ? ` × ${formatMeters(item.height)}` : ''} m，主色 ${item.color}`;
