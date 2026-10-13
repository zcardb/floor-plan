import { lazy } from 'react';

export { accountFurniturePage } from './api/library-pages';
export { useAccountLibrary } from './hooks/use-account-library';

/** 家具管理页：进入管理端「家具管理」时才下载。 */
export const AccountFurnitureLibrary = lazy(() => import('./components/account-furniture-library').then(m => ({ default: m.AccountFurnitureLibrary })));
/** 新建 / 导入自定义家具与材料的弹窗：在编辑器里首次打开时才下载。 */
export const CustomFurnitureDialog = lazy(() => import('./components/custom-furniture-dialog').then(m => ({ default: m.CustomFurnitureDialog })));
