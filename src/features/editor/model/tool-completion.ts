import type { Tool } from '@/lib/floor-plan/types';

export const supportsPointerCompletion = (tool: Tool) => tool === 'wall' || tool === 'separator';
export const isCompletionClick = (tool: Tool, button: number, detail: number) => supportsPointerCompletion(tool) && button === 0 && detail > 1;
