import { BrickWall, RectangleVertical, SeparatorVertical, type LucideIcon } from 'lucide-react';
import type { Tool } from '../model/types';

/** 墙体类工具：顶部「墙 ▾」下拉与左侧「硬装 · 墙」分组共用。 */
export const wallTools: { tool: Tool; label: string; icon: LucideIcon; hint: string }[] = [
  { tool: 'wall', label: '墙', icon: BrickWall, hint: '点击起点与转角连续绘墙' },
  { tool: 'passage', label: '垭口', icon: RectangleVertical, hint: '无门扇的落地洞口' },
  { tool: 'separator', label: '房间分隔线', icon: SeparatorVertical, hint: '不砌墙也能划分房间，不计价' },
];
export const isWallTool = (tool: Tool) => wallTools.some(t => t.tool === tool);
