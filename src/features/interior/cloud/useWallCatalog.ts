import { useColorMaterialCatalog } from './useColorMaterialCatalog';

/** 账号墙面库：与账号地面库同构，仅本人可读写。 */
export const useWallCatalog = () => useColorMaterialCatalog('wall');
