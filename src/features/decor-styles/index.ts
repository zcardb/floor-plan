import { lazy } from 'react';

export { saveAccountStyle } from './api/account-styles';
export { StylePanel } from './components/style-panel';

/** 风格管理页（含风格详情）：进入管理端「风格管理」时才下载。 */
export const StyleManager = lazy(() => import('./components/style-manager').then(m => ({ default: m.StyleManager })));
