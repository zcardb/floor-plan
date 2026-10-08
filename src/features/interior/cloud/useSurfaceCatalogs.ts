import { useColorMaterialCatalog } from './useColorMaterialCatalog';

/** 账号屋面库、吊顶库：结构与墙面库相同，仅本人可读写。 */
export const useRoofCatalog = () => useColorMaterialCatalog('roof');
export const useCeilingCatalog = () => useColorMaterialCatalog('ceiling');
