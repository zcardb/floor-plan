import { HARD_CATEGORIES } from '@/lib/floor-plan/hard-materials';
import type { LibraryItem } from '@/lib/floor-plan/types';

/** 只有软装家具有 3D 视角；硬装（地面、墙面、门窗、屋面、吊顶）只有 2D。 */
export const hasViews = (item: LibraryItem) => !HARD_CATEGORIES.includes(item.category);
