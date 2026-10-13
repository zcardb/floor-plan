import { lazy } from 'react';

export { useAiCatalog } from './hooks/use-ai-catalog';
export { useFurnitureImage } from './hooks/use-furniture-image';
export { useRoomAi } from './hooks/use-room-ai';
export type { AiEntryTone } from './hooks/use-room-ai';
export type { FurnitureAiResult } from './components/furniture-ai-dialog';

/* AI 界面较重（提示词编辑、结果预览、Markdown 渲染），一律首次打开时才下载。 */
export const AiRoomDialog = lazy(() => import('./components/ai-room-dialog').then(m => ({ default: m.AiRoomDialog })));
export const AiChatPanel = lazy(() => import('./components/ai-chat-panel').then(m => ({ default: m.AiChatPanel })));
export const AiCreateProjectDialog = lazy(() => import('./components/ai-create-project-dialog').then(m => ({ default: m.AiCreateProjectDialog })));
/** 账号家具图片的 AI 调整。 */
export const FurnitureAiDialog = lazy(() => import('./components/furniture-ai-dialog').then(m => ({ default: m.FurnitureAiDialog })));
/** 小助手管理页：进入管理端「小助手」时才下载。 */
export const AssistantManager = lazy(() => import('./components/assistant-manager').then(m => ({ default: m.AssistantManager })));
