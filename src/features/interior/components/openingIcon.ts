import { DoorOpen, PanelsTopLeft, RectangleVertical, type LucideIcon } from 'lucide-react';
import type { OpeningKind } from '../model/types';

const ICONS: Record<OpeningKind, LucideIcon> = { door: DoorOpen, window: PanelsTopLeft, passage: RectangleVertical };

/** 门 / 窗 / 垭口在列表、表单与属性面板中的图标。 */
export const openingIcon = (kind: OpeningKind): LucideIcon => ICONS[kind];
