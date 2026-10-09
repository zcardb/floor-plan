import { useContext, useState } from 'react';
import { notify } from '@/lib/notify';
import { effectiveCostDesign } from '../model/costDefaults';
import { furnitureKey, priceOf, setPrice } from '../model/costs';
import type { Design, Furniture } from '../model/types';
import { AccountCostSaveContext, CostDefaultsContext } from './CostDefaultsContext';
import { PriceInput } from './PriceInput';

/** 项目内家具单价；登录时可勾选同步到账号家具库（账号库未定价默认勾选）。 */
export function FurniturePriceField({ design, furniture, change }: { design: Design; furniture: Furniture; change: (fn: (d: Design) => Design) => void }) {
  const defaults = useContext(CostDefaultsContext), saveAccount = useContext(AccountCostSaveContext);
  const key = furnitureKey(furniture);
  const accountPrice = priceOf(effectiveCostDesign({ ...design, costSettings: {} }, defaults), 'furniturePrices', key);
  const [sync, setSync] = useState(accountPrice === null);
  const value = priceOf(effectiveCostDesign(design, defaults), 'furniturePrices', key);
  const apply = async (price: number | null) => {
    if (saveAccount && sync) {
      const ok = await saveAccount({ ...defaults, furniturePrices: { ...defaults.furniturePrices, [key]: price } });
      if (!ok) { notify.fail(`「${furniture.name}」未能同步到账号库，请重试`); return false; }
    }
    change(d => setPrice(d, 'furniturePrices', key, price));
  };
  return <div className="furniture-price-field">
    <h3 className="section-title">家具单价 <small>元 / 件 · 同款联动</small></h3>
    <PriceInput key={key + value} value={value} label={furniture.name + '单价'} onApply={apply}/>
    {saveAccount && <label className="price-sync-option">
      <input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)}/>
      同步到账号家具库{accountPrice === null ? '（账号库未定价）' : ''}
    </label>}
    <p className="footnote">{saveAccount && sync ? '应用后同时更新账号默认单价，其他未单独调价的项目一并生效。' : '修改仅影响当前项目的同款家具，自动计入软装总成本。'}</p>
  </div>;
}
