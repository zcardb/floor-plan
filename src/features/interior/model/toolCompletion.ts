import type { Tool } from './types';

export const supportsPointerCompletion = (tool: Tool) => tool === 'wall';
export const isCompletionClick = (tool: Tool, button: number, detail: number) => supportsPointerCompletion(tool) && button === 0 && detail > 1;
