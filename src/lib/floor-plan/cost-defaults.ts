import type { CostSettings, Design } from './types';
export type AccountCostSettings = Omit<CostSettings, 'labor'>;
export const priceGroups = ['floorPrices','wallPrices','furniturePrices','openingPrices','roofPrices','ceilingPrices','constructionPrices'] as const;
export function effectiveCostDesign(d: Design, defaults: AccountCostSettings = {}): Design {
  const settings: CostSettings = { ...defaults, ...d.costSettings, labor: d.costSettings?.labor };
  for (const group of priceGroups) settings[group] = { ...defaults[group], ...d.costSettings?.[group] };
  settings.procurement = { ...defaults.procurement, ...d.costSettings?.procurement };
  // A legacy project price is expressed per square metre, never in an inherited package unit.
  for (const key of Object.keys(d.costSettings?.floorPrices || {})) {
    if (!d.costSettings?.procurement?.[key]) settings.procurement[key] = { unit: 'm²', waste: 5 };
  }
  return { ...d, costSettings: settings };
}
export function restorePrice(d: Design, group: typeof priceGroups[number], key: string): Design {
  const settings = structuredClone(d.costSettings || {});
  delete settings[group]?.[key];
  if (group === 'floorPrices') delete settings.procurement?.[key];
  return { ...d, costSettings: settings };
}
export function priceSource(d: Design, defaults: AccountCostSettings, group: typeof priceGroups[number], key: string) {
  return d.costSettings?.[group]?.[key] !== undefined ? '项目覆盖' : defaults[group]?.[key] !== undefined ? '账号默认' : '内置参考';
}
