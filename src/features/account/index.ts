import { lazy } from 'react';

/** 登录 / 注册弹窗：首次打开时才下载。 */
export const AuthDialog = lazy(() => import('./components/auth-dialog').then(m => ({ default: m.AuthDialog })));
