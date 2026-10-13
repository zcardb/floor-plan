export type { Scene3D, SceneFailure, SceneHandle, SceneOptions } from './components/scene-3d';

/** 3D 场景（three.js）：切到 3D 或空闲预加载时才下载。 */
export const loadScene3D = () => import('./components/scene-3d');
