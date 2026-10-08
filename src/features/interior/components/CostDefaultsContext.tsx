import { createContext, useContext, useMemo } from 'react';
import { effectiveCostDesign, type AccountCostSettings } from '../model/costDefaults';
import type { Design } from '../model/types';
export const CostDefaultsContext = createContext<AccountCostSettings>({});
export function useCostDesign(design: Design) {
  const defaults = useContext(CostDefaultsContext);
  return useMemo(() => effectiveCostDesign(design, defaults), [design, defaults]);
}
