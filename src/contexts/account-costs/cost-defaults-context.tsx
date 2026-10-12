import { createContext, useContext, useMemo } from 'react';
import { effectiveCostDesign, type AccountCostSettings } from '@/lib/floor-plan/cost-defaults';
import type { Design } from '@/lib/floor-plan/types';
export const CostDefaultsContext = createContext<AccountCostSettings>({});
/** 登录后提供：把账号默认价写回账号库；游客为 null。 */
export const AccountCostSaveContext = createContext<((next: AccountCostSettings) => Promise<boolean>) | null>(null);
export function useCostDesign(design: Design) {
  const defaults = useContext(CostDefaultsContext);
  return useMemo(() => effectiveCostDesign(design, defaults), [design, defaults]);
}
