import { lazy } from 'react';

export type { Scene3D, SceneFailure, SceneHandle, SceneOptions } from './components/scene-3d';
export type { ModelSnapshot } from './components/furniture-model-preview';

/** 3D 场景（three.js）：切到 3D 或空闲预加载时才下载。 */
export const loadScene3D = () => import('./components/scene-3d');

/**
 * 单件家具的实时 3D 预览（可拖动旋转，与项目 3D 场景同一套模型）：家具详情的 3D 视角与 AI 3D 候选使用。
 * 懒加载：首次显示时才下载 three。调用方需包一层 Suspense。
 */
export const FurnitureModelPreview = lazy(() => import('./components/furniture-model-preview').then(m => ({ default: m.FurnitureModelPreview })));
